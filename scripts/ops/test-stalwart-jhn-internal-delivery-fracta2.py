#!/usr/bin/env python3
"""One direct *logical* intra-Twin JMAP send, then independent recipient read.

JMAP protocol requires Email/set + EmailSubmission/set; both are chained into
ONE automatic request, with NO human draft-review/approval stage. Successful
submission deletes the temporary sender object. Only named local agents may
participate. No public SMTP/IMAP listener or third-party addresses.

Default mode = read-only preflight. --apply = one internal synthetic message.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

HOST = 'http://127.0.0.1:8080'
SENDER = 'john@mail.fractavolta.com'
RECIPIENT = 'john-worker@mail.fractavolta.com'
CREDS = Path('/etc/stalwart/jhn-agent-mailboxes.json')
USING = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:ietf:params:jmap:submission']


def http(address: str, secret: str, path: str, payload: dict | None = None) -> dict:
    token = base64.b64encode((address + ':' + secret).encode()).decode()
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(HOST+path, data=data,
        headers={'Authorization':'Basic '+token,'Content-Type':'application/json'},
        method='POST' if data is not None else 'GET')
    with urllib.request.urlopen(req,timeout=10) as res:
        return json.load(res)


def calls(address: str, secret: str, methods: list) -> dict:
    obj = http(address,secret,'/jmap',{'using':USING,'methodCalls':methods})
    return {cid:(name,body) for name,body,cid in obj.get('methodResponses',[])}


def get(resp:dict, id:str, expected:str) -> dict:
    method,body = resp.get(id,('missing',{}))
    if method!=expected:
        raise RuntimeError(f'JMAP call {id}: expected {expected}, got {method}')
    return body


def session(address:str,secret:str)->str:
    obj=http(address,secret,'/jmap/session')
    aid=obj.get('primaryAccounts',{}).get('urn:ietf:params:jmap:mail')
    if not aid or aid not in obj.get('accounts',{}):
        raise RuntimeError('Missing mail account for '+address)
    return aid


def assert_server_private():
    state=subprocess.run(('systemctl','is-active','--quiet','stalwart.service'),check=False)
    if state.returncode != 0:raise RuntimeError('Stalwart inactive')
    env=subprocess.check_output(('systemctl','show','stalwart.service','-p','Environment','--value'),text=True)
    if 'STALWART_RECOVERY_MODE=true' in env:raise RuntimeError('Not in normal mode')
    ports=[]
    for row in subprocess.check_output(('ss','-ltnH'),text=True).splitlines():
        fields=row.split()
        if len(fields)<4:continue
        bind=fields[3]
        try:port=int(bind.rsplit(':',1)[1])
        except (IndexError,ValueError):continue
        if port in (25,465,587,993,995,4190,2525):raise RuntimeError('Unexpected SMTP/IMAP listener')
        if port==8080:ports.append(bind)
    if ports!=['127.0.0.1:8080']:raise RuntimeError('JMAP not confined to localhost')


def mailboxes(address:str,secret:str,account:str) -> list[dict]:
    obj=get(calls(address,secret,[['Mailbox/get',{'accountId':account,'ids':None},'b']]),'b','Mailbox/get')
    return obj.get('list',[])


def identity(address:str,secret:str,account:str)->str:
    obj=get(calls(address,secret,[['Identity/get',{'accountId':account,'ids':None},'i']]),'i','Identity/get')
    ids=[i['id'] for i in obj.get('list',[]) if i.get('email','').lower()==address]
    if len(ids)!=1:raise RuntimeError('No unique JMAP sending identity for '+address+'; aborting before sending')
    return ids[0]


def role_id(items:list[dict],role:str)->str:
    ids=[x['id'] for x in items if x.get('role')==role]
    if len(ids)!=1:raise RuntimeError('Expected one '+role+' mailbox; found '+str(len(ids)))
    return ids[0]


def send_once(secret:str,account:str,drafts:str,identity_id:str,subject:str,body:str):
    # JMAP's protocol-level Email creation is NOT a COP draft review workflow.
    # Both operations occur together in one request; no user confirmation.
    create={
      'mailboxIds':{drafts:True},'keywords':{'$draft':True},
      'from':[{'email':SENDER}], 'to':[{'email':RECIPIENT}],
      'subject':subject, 'textBody':[{'partId':'p1','type':'text/plain'}],
      'bodyValues':{'p1':{'value':body}},
    }
    methods=[
      ['Email/set',{'accountId':account,'create':{'m':create}},'email'],
      ['EmailSubmission/set',{
        'accountId':account,'create':{'s':{
          'emailId':'#m','identityId':identity_id,
          'envelope':{'mailFrom':{'email':SENDER},'rcptTo':[{'email':RECIPIENT}]}
        }},'onSuccessDestroyEmail':['#s']
      },'send']
    ]
    resp=calls(SENDER,secret,methods)
    created=get(resp,'email','Email/set')
    if 'm' not in created.get('created',{}):raise RuntimeError('Email staging rejected: '+str(created.get('notCreated',{})))
    submitted=get(resp,'send','EmailSubmission/set')
    if 's' not in submitted.get('created',{}):raise RuntimeError('Internal message submission rejected: '+str(submitted.get('notCreated',{})))
    print('SUBMITTED: one automatic JMAP intra-Twin message; no human draft review')


def received(secret:str,account:str,inbox:str,subject:str,body:str)->bool:
    r=calls(RECIPIENT,secret,[['Email/query',{'accountId':account,'filter':{'inMailbox':inbox,'subject':subject}},'q']])
    ids=get(r,'q','Email/query').get('ids',[])
    if not ids:return False
    m=calls(RECIPIENT,secret,[['Email/get',{'accountId':account,'ids':ids[:5],
      'properties':['id','subject','from','to','textBody','bodyValues'],
      'fetchTextBodyValues':True},'g']])
    messages=get(m,'g','Email/get').get('list',[])
    for item in messages:
        if item.get('subject')!=subject:continue
        if SENDER not in [v.get('email') for v in (item.get('from') or [])]:continue
        if RECIPIENT not in [v.get('email') for v in (item.get('to') or [])]:continue
        vals=item.get('bodyValues') or {}
        if any(body in (v.get('value') or '') for v in vals.values()):return True
    return False


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--apply',action='store_true',help='send one strictly internal message and verify receipt')
    args=p.parse_args()
    if os.geteuid()!=0:raise RuntimeError('Need root solely to read local credentials')
    assert_server_private()
    creds=json.loads(CREDS.read_text())
    for name in (SENDER,RECIPIENT):
        if not isinstance(creds.get(name),str) or len(creds[name])<16:
            raise RuntimeError('No private credential for '+name)
    sender_id=session(SENDER,creds[SENDER]); recipient_id=session(RECIPIENT,creds[RECIPIENT])
    sender_boxes=mailboxes(SENDER,creds[SENDER],sender_id)
    recipient_boxes=mailboxes(RECIPIENT,creds[RECIPIENT],recipient_id)
    drafts=role_id(sender_boxes,'drafts')
    inbox=role_id(recipient_boxes,'inbox')
    sending_identity=identity(SENDER,creds[SENDER],sender_id)
    print('PREFLIGHT_OK: both agents authenticated via localhost JMAP; sender identity, Drafts staging and recipient Inbox present')
    if not args.apply:
        print('READ_ONLY: no messages created or submitted; run with --apply for the internal delivery recipe')
        return
    correlation=uuid.uuid4().hex
    subject='Cogentia inter-agent delivery check '+correlation
    body='Private intra-Twin message from John to John Worker. Receipt token: '+correlation
    send_once(creds[SENDER],sender_id,drafts,sending_identity,subject,body)
    for i in range(30):
        if received(creds[RECIPIENT],recipient_id,inbox,subject,body):
            print('PASS: exact subject, sender, recipient, and body verified in john-worker Inbox; no external mail')
            return
        time.sleep(1)
    raise RuntimeError('Submission accepted, but the recipient Inbox delivery was NOT verified within 30 checks')

if __name__=='__main__':
    try:main()
    except urllib.error.HTTPError as e:
        print('FAILED: HTTP '+str(e.code),file=sys.stderr);sys.exit(1)
    except Exception as e:
        print('FAILED: '+str(e),file=sys.stderr);sys.exit(1)
