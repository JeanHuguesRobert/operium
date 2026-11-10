#!/usr/bin/env python3
"""Bounded FractaFunction preview deployment with rollback, no public route.

Preview is default. --apply installs only two loopback systemd services.
No Caddy, DNS, COP issuer, mandate or stored approval is modified.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT=Path('/srv/cogentia/repos/operium/runtimes/serverless/deploy')
UNITS=('fractafunction-jhn-deno.service','fractafunction-jhn-preview.service')
DEST=Path('/etc/systemd/system')
UUID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

def run(*cmd):return subprocess.run(cmd,check=True,capture_output=True,text=True)
def probe(path,expected,headers=None):
    req=urllib.request.Request('http://127.0.0.1:8795'+path,headers=headers or {})
    try:
        with urllib.request.urlopen(req,timeout=6) as r:return r.status==expected
    except urllib.error.HTTPError as e:return e.code==expected
    except urllib.error.URLError:return False

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--apply',action='store_true')
    args=p.parse_args()
    for name in UNITS:
        if not (ROOT/name).is_file():raise RuntimeError('missing_unit:'+name)
        existing=DEST/name
        if existing.exists() and existing.read_bytes()!=(ROOT/name).read_bytes():
            raise RuntimeError('existing_unit_differs:'+name)
    app=Path('/srv/cogentia/repos/inseme/apps/platform/dist/index.html')
    if not app.is_file():raise RuntimeError('jhn_frontend_not_built')
    if not args.apply:
        print('PREVIEW: would install two loopback-only services, ports 8795 and 8797')
        print('No Caddy, DNS or COP decision changes. Use --apply from owner SSH to activate.')
        return
    if os.geteuid()!=0:raise RuntimeError('root_required')
    created=[]
    originally_active={name: subprocess.run(['systemctl','is-active','--quiet',name]).returncode==0 for name in UNITS}
    try:
        for name in UNITS:
            target=DEST/name
            if not target.exists():
                shutil.copyfile(ROOT/name,target);target.chmod(0o644);created.append(name)
        run('systemctl','daemon-reload')
        for name in UNITS:run('systemctl','enable','--now',name)
        for _ in range(15):
            if probe('/cop/consent/'+UUID,200) and probe('/api/corsica/context',400) and probe('/api/cop/principal-consent/'+UUID,401):
                print('SUCCESS: SPA 200; Deno function 400; canonical COP anonymous 401; no public route')
                return
            time.sleep(.3)
        raise RuntimeError('staging_healthcheck_failed')
    except Exception:
        for name in reversed(UNITS):
            if not originally_active[name]:
                subprocess.run(['systemctl','disable','--now',name],capture_output=True)
        for name in created:(DEST/name).unlink(missing_ok=True)
        subprocess.run(['systemctl','daemon-reload'],capture_output=True)
        raise

if __name__=='__main__':
    try:main()
    except Exception as e:
        print('DEPLOY REFUSED:',e,file=sys.stderr);sys.exit(1)
