#!/usr/bin/env python3
"""Owner-operated JHN HTTPS + Cloudflare DNS cutover with rollback.

Explicit --apply required; only jhn.baronsmariani.org record is mutable.
Runs Netlify DNS rollback if downstream checks fail, then removes our Caddy
fragment and disables only newly activated services. It does not turn on COP.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

BASE=Path('/srv/cogentia/repos/operium/runtimes/serverless/deploy')
CADDY=Path('/etc/caddy/fracta2-edge-https/jhn-fractafunction.caddy')
FRAGMENT=BASE/'jhn-caddy-cutover.caddy'
DNS=BASE/'cloudflare-jhn-launch.js'
NODE='/usr/local/node-v26.5.0/bin/node'
HOST='jhn.baronsmariani.org'
IP='82.70.234.207'
UNITS=('fractafunction-jhn-deno.service','fractafunction-jhn-preview.service')

def run(args, *, check=True, timeout=50):
    return subprocess.run(args,check=check,timeout=timeout,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)

def dns(action):
    result=run(['runuser','-u','ubuntu','--',NODE,str(DNS),action],timeout=45)
    rows=[json.loads(line) for line in result.stdout.splitlines() if line.startswith('{') and 'fractafunction.jhn.dns.v1' in line]
    if len(rows)!=1:raise RuntimeError('dns_receipt_missing')
    return rows[0]

def local_check():
    for path,status in [('/cop/consent/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','200'),('/api/corsica/context','400'),('/api/cop/principal-consent/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','401')]:
        r=run(['curl','--silent','--show-error','--max-time','7','-o','/dev/null','-w','%{http_code}','http://127.0.0.1:8795'+path],check=False,timeout=10)
        if r.stdout!=status:raise RuntimeError('local_preview_failed:'+path+':'+r.stdout)

def https_check(*,insecure):
    command=['curl','--silent','--show-error','--max-time','9','--resolve',f'{HOST}:443:{IP}','-o','/dev/null','-w','%{http_code}',f'https://{HOST}/cop/consent/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']
    if insecure:command.insert(1,'--insecure')
    r=run(command,check=False,timeout=12)
    return r.returncode==0 and r.stdout=='200'

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    if not FRAGMENT.exists() or not DNS.exists():raise RuntimeError('missing_deployment_artifacts')
    if not args.apply:
        print('DRY_RUN: two loopback services, one HTTPS Caddy fragment, then one Cloudflare jhn CNAME -> A record')
        print('TARGET:',HOST,IP,'DNS_ONLY; unrelated DNS records unchanged')
        print('KNOWN DEGRADATION: chat POST, GitHub webhook, Olé Olé, artifacts and other pending APIs remain unavailable')
        print('COP DECISION/GRANTS: unchanged; source Netlify CNAME backed up as scripted rollback')
        return
    if os.geteuid()!=0:raise RuntimeError('owner_sudo_required')
    if CADDY.exists():raise RuntimeError('jhn_caddy_vhost_already_exists: reconcile_first')
    original=dns('audit')
    if original.get('state')!='netlify':raise RuntimeError('unexpected_dns_starting_state')
    previously_active={u:run(['systemctl','is-active','--quiet',u],check=False).returncode==0 for u in UNITS}
    caddy_written=False
    dns_written=False
    try:
        # Installer handles its own services rollback if the local check fails.
        run(['python3',str(BASE/'install-jhn-fractafunction-preview.py'),'--apply'],timeout=100)
        local_check()
        shutil.copyfile(FRAGMENT,CADDY)
        CADDY.chmod(0o644)
        caddy_written=True
        run(['caddy','validate','--config','/etc/caddy/Caddyfile'],timeout=20)
        run(['systemctl','reload','caddy'],timeout=20)
        # ACME may need the new public A record. Validate Caddy and its
        # successful reload before DNS, then check real TLS after DNS.
        receipt=dns('apply')
        dns_written=receipt.get('state')=='fracta2'
        if not dns_written:raise RuntimeError('cloudflare_dns_write_unconfirmed')
        # Cloudflare API returns a write receipt, but authoritative DNS and
        # certificate validation are separate acceptance evidence.
        authoritative=False
        for _ in range(12):
            answers=run(['dig','+short','@josephine.ns.cloudflare.com',HOST,'A'],check=False,timeout=8)
            if IP in answers.stdout.splitlines():authoritative=True;break
            time.sleep(3)
        if not authoritative:raise RuntimeError('authoritative_dns_not_updated')
        for _ in range(18):
            if https_check(insecure=False):break
            time.sleep(5)
        else:raise RuntimeError('https_certificate_not_validated')
        print(json.dumps({'schema':'operium.jhn_cutover_receipt.v1','dns':'fracta2','origin':IP,
                          'https':'valid','caddy':'active','node_deno':'active','other_apis':'partial'}))
    except Exception as error:
        rollback_failed=False
        # A lost response to a successful Cloudflare PUT is ambiguous.
        # Re-read the authoritative provider and roll back based on state.
        try:
            present=dns('audit')
            if present.get('state')=='fracta2':dns('rollback')
        except Exception:
            rollback_failed=True
        if caddy_written:
            CADDY.unlink(missing_ok=True)
            subprocess.run(['systemctl','reload','caddy'],capture_output=True)
        for unit in reversed(UNITS):
            if not previously_active[unit]:
                subprocess.run(['systemctl','disable','--now',unit],capture_output=True)
        if rollback_failed:raise RuntimeError('ROLLBACK_DNS_FAILED_MANUAL_INTERVENTION_REQUIRED') from error
        raise RuntimeError('CUTOVER_REFUSED_ROLLED_BACK:'+str(error)) from error

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('ERROR:',str(error),file=sys.stderr)
        sys.exit(1)
