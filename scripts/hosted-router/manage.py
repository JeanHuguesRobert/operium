"""Atomic dynamic registry administration (requires filesystem write permission).

No passwords or bcrypt hashes accepted on the CLI; hashes are read from a
private file. Never prints or logs hashes or password-file contents.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import tempfile
from core import load_registry


def write_atomic(path, registry):
    path=Path(path)
    old=path.stat()
    fd,name=tempfile.mkstemp(prefix='.'+path.name+'.',dir=path.parent)
    try:
        os.fchmod(fd, old.st_mode & 0o777)
        os.fchown(fd, old.st_uid, old.st_gid)
        with os.fdopen(fd,'w') as f:
            json.dump(registry,f,separators=(',',':'))
            f.write('\n')
            f.flush();os.fsync(f.fileno())
        os.replace(name,path)
        dirfd=os.open(path.parent,os.O_RDONLY)
        try: os.fsync(dirfd)
        finally: os.close(dirfd)
    finally:
        if os.path.exists(name): os.unlink(name)


def main(argv=None):
    ap=argparse.ArgumentParser()
    ap.add_argument('--registry',default='/etc/operium/hosted-browser/router.json')
    subs=ap.add_subparsers(dest='cmd',required=True)
    subs.add_parser('list')
    p=subs.add_parser('disable'); p.add_argument('login')
    p=subs.add_parser('enable');p.add_argument('login')
    p=subs.add_parser('rotate');p.add_argument('login');p.add_argument('--hash-file',required=True)
    p=subs.add_parser('add');p.add_argument('login');p.add_argument('--id',required=True);p.add_argument('--port',required=True,type=int);p.add_argument('--hash-file',required=True)
    args=ap.parse_args(argv)
    if args.cmd!='list':
        lock_fd=os.open(str(args.registry)+'.lock',os.O_CREAT|os.O_RDWR,0o600)
        fcntl.flock(lock_fd,fcntl.LOCK_EX)
    db=load_registry(args.registry)
    if args.cmd=='list':
        print(json.dumps([{'id':w['id'],'login':w['login'],'port':w['port'],'enabled':w['enabled']} for w in db['workspaces']]))
        return
    matching=[w for w in db['workspaces'] if w['login']==args.login]
    if args.cmd=='add' and matching: ap.error('login already exists')
    if args.cmd!='add' and len(matching)!=1: ap.error('unknown or ambiguous login')
    if args.cmd in ('add','rotate'):
        hp=Path(args.hash_file)
        if hp.stat().st_mode & 0o077: ap.error('hash file must be owner-private')
        hash_value=hp.read_text().strip()
        if not hash_value.startswith(('$2a$','$2b$','$2y$')) or len(hash_value)!=60:
            ap.error('invalid bcrypt hash')
    if args.cmd=='add':
        if args.port not in range(1024,65536): ap.error('invalid port')
        if any(w['port']==args.port or w['id']==args.id for w in db['workspaces']):
            ap.error('port or id already assigned')
        db['workspaces'].append({'id':args.id,'login':args.login,'bcrypt_hash':hash_value,'host':'127.0.0.1','port':args.port,'enabled':True})
    elif args.cmd=='rotate': matching[0]['bcrypt_hash']=hash_value
    else: matching[0]['enabled']=(args.cmd=='enable')
    # Validate all invariants before durable replacement.
    temp=Path(args.registry).with_name('.router-validation-'+str(os.getpid()))
    try:
        temp.write_text(json.dumps(db))
        load_registry(temp)
    finally:
        temp.unlink(missing_ok=True)
    write_atomic(args.registry, db)
    print(f'{args.cmd}: applied for {args.login}')
    os.close(lock_fd)

if __name__=='__main__':main()
