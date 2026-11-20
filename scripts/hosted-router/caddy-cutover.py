"""Backed-up, reversible one-time Hosted Browser Caddy cutover.

Default is read-only preflight. --apply requires prior *human-confirmed* real
acceptance for ALL existing users. Never run --apply merely because fixtures pass.
"""
import argparse
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile

BASE=Path('/etc/caddy/fracta2-edge-https/browser-tls.caddy')
BACKUP=Path('/etc/operium/hosted-browser/caddy-pre-dynamic-router.caddy')
CADDY_MAIN=Path('/etc/caddy/Caddyfile')

spec=importlib.util.spec_from_file_location('router_caddy',Path(__file__).with_name('render-caddy-candidate.py'))
renderer=importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)


def run(*cmd):
    r=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    if r.returncode:
        raise RuntimeError(f'{cmd[0]} operation failed (exit {r.returncode})')


def replace_mode(path, content, stat):
    fd,name=tempfile.mkstemp(prefix='.router-caddy-',dir=path.parent)
    try:
        os.fchmod(fd,stat.st_mode&0o777)
        os.fchown(fd,stat.st_uid,stat.st_gid)
        with os.fdopen(fd,'w') as f:
            f.write(content)
            f.flush();os.fsync(f.fileno())
        os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)


def preflight():
    old=BASE.read_text()
    candidate=renderer.render(old)
    if not '127.0.0.1:8768' in candidate:
        raise RuntimeError('dynamic route absent')
    # Validate isolated candidate using the Caddyfile adapter; no live change.
    with tempfile.TemporaryDirectory() as d:
        candidate_file=Path(d)/'candidate.caddy'
        candidate_file.write_text(candidate)
        run('caddy','validate','--adapter','caddyfile','--config',str(candidate_file))
    return old,candidate


def apply():
    old,candidate=preflight()
    if BACKUP.exists():
        raise RuntimeError('a cutover backup already exists; inspect before retry')
    fd=os.open(BACKUP,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:
        f.write(old);f.flush();os.fsync(f.fileno())
    stats=BASE.stat()
    try:
        replace_mode(BASE,candidate,stats)
        run('caddy','validate','--config',str(CADDY_MAIN))
        run('systemctl','reload','caddy')
        # Anonymous browser should fail closed. HTTP 401 is intentional.
        r=subprocess.run(['curl','-ksS','--max-time','7','--resolve','browser.fractavolta.com:443:127.0.0.1',
                          '-o','/dev/null','-w','%{http_code}','https://browser.fractavolta.com/'],
                         text=True,capture_output=True)
        if r.returncode or r.stdout.strip()!='401':
            raise RuntimeError('anonymous public browser challenge did not return 401')
        print('Applied: public browser now proxies to 127.0.0.1:8768; backup retained at '+str(BACKUP))
    except Exception:
        replace_mode(BASE,old,stats)
        run('caddy','validate','--config',str(CADDY_MAIN))
        run('systemctl','reload','caddy')
        raise


def rollback():
    if not BACKUP.exists():
        raise RuntimeError('no recorded backup')
    current=BASE.read_text()
    if 'reverse_proxy 127.0.0.1:8768' not in current:
        raise RuntimeError('live browser vhost not on dynamic route; refusing surprise overwrite')
    stats=BASE.stat()
    replace_mode(BASE,BACKUP.read_text(),stats)
    run('caddy','validate','--config',str(CADDY_MAIN))
    run('systemctl','reload','caddy')
    print('Rolled back to saved static browser routing; backup retained')


def main():
    ap=argparse.ArgumentParser()
    mode=ap.add_mutually_exclusive_group()
    mode.add_argument('--apply',action='store_true')
    mode.add_argument('--rollback',action='store_true')
    ap.add_argument('--accepted-all-users',action='store_true',help='manual acceptance attestation for apply only')
    args=ap.parse_args()
    if args.apply:
        if not args.accepted_all_users: ap.error('--apply requires --accepted-all-users after real authenticated acceptance')
        apply()
    elif args.rollback:rollback()
    else:
        preflight()
        print('PRECHECK PASS: candidate syntax valid; no Caddy modifications')

if __name__=='__main__':
    try:main()
    except (OSError,ValueError,RuntimeError) as ex:
        print(f'CUTOVER FAILED: {ex}',file=sys.stderr)
        sys.exit(1)
