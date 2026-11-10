#!/usr/bin/env python3
"""Read-only JMAP login and mailbox visibility for two locally provisioned agents.

Never prints passwords, messages or secrets. Does not create SMTP listeners.
Run with sudo on Fracta2; uses loopback HTTP only.
"""
import base64
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

URL = 'http://127.0.0.1:8080'
DOMAIN = 'mail.fractavolta.com'
ACCOUNTS = ('john', 'john-worker')
CREDENTIALS = Path('/etc/stalwart/jhn-agent-mailboxes.json')


def request(path, username, password, payload=None):
    token = base64.b64encode((username+':'+password).encode()).decode()
    body = json.dumps(payload).encode() if payload else None
    req = urllib.request.Request(URL+path, data=body, headers={
        'Authorization': 'Basic '+token,
        'Content-Type': 'application/json',
    }, method='POST' if payload else 'GET')
    with urllib.request.urlopen(req, timeout=8) as reply:
        return json.load(reply)


def check(username, password):
    session = request('/jmap/session',username,password)
    primary = session.get('primaryAccounts',{})
    mail_account = primary.get('urn:ietf:params:jmap:mail')
    assert mail_account, 'missing JMAP mail account'
    assert mail_account in session.get('accounts',{}), 'mail account not in session accounts'
    result = request('/jmap',username,password,{
        'using':['urn:ietf:params:jmap:core','urn:ietf:params:jmap:mail'],
        'methodCalls':[['Mailbox/query',{'accountId':mail_account},'q1']]
    })
    matches=[entry for entry in result.get('methodResponses',[]) if entry[2]=='q1']
    assert len(matches)==1 and matches[0][0]=='Mailbox/query', 'mailbox query unavailable'
    inbox_count=len(matches[0][1].get('ids',[]))
    print('PASS '+username+' authenticated; JMAP mail account present; accessible mailboxes='+str(inbox_count))


def main():
    if os.geteuid()!=0: raise RuntimeError('sudo/root required to read local credentials')
    accounts=json.loads(CREDENTIALS.read_text())
    for name in ACCOUNTS:
        addr=name+'@'+DOMAIN
        secret=accounts.get(addr)
        if not isinstance(secret,str) or not secret:
            raise RuntimeError('Missing local credential reference for '+addr)
        check(addr,secret)
    print('PASS: both internal agents can use JMAP via localhost HTTP; read-only; no mail sent')

if __name__=='__main__':
    try: main()
    except urllib.error.HTTPError as exc:
        print('FAILED: JMAP HTTP '+str(exc.code),file=sys.stderr);sys.exit(1)
    except Exception as exc:
        print('FAILED: '+str(exc),file=sys.stderr);sys.exit(1)
