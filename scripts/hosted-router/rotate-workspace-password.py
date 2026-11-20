"""Owner-operated, private and reversible Maguy KasmVNC + router rotation.

Run interactively as root on Fracta2; NEVER through a logging agent/tool.
Prints the new passphrase only to the owner's terminal after HTTP acceptance.
Does not restart or modify Caddy, KasmVNC, or another user's account.
"""
import base64
import datetime
import http.client
import os
from pathlib import Path
import secrets
import shutil
import ssl
import subprocess
import sys
import tempfile

import bcrypt
from core import load_registry
from manage import write_atomic

REGISTRY = Path('/etc/operium/hosted-browser/router.json')
KASM = Path('/home/hosted-margueriteghionga/.kasmpasswd')
INITIAL = Path('/root/hosted-browser-maguy-initial-credential')
BACKUPS = Path('/root/hosted-browser-credential-rotations')
LOGIN = 'maguy'
PORT = 8446
WORDS = tuple('''abricot amande ancre ardoise argile aube azur baleine bambou banane bateau berceau bijou biscuit bleu bonnet boussole branche brise bulle cacao cadeau caillou canard caramel carotte cascade cerise cercle chalet chanson citron cloche coco colline comete corail coton coucou crayon cube dauphin dessin diamant douceur dragon dune eclair ecole ecureuil etoile falaise farine ficelle figue flocon fleur fontaine foret fourmi fraise galet gazelle girafe glace gomme goutte graine grenouille hamac herisson hibou horizon image jardin jasmin jonquille kiwi lacet lagune lampe lavande lilas limonade lune lutin magie maison mangue marin melodie merle miel miroir mousse mouton myrtille nacre neige nuage olive orange orchidée orme ourson papillon parfum perle piano plume poire pomme prairie prune puzzle racine radis raisin renard riviere rose ruban sable sapin satin soleil sourire sucre tapis tomate tortue tulipe vague vanille velo verger violet volcan voyage zebre'''.split())


def candidate():
    # Six independent words from a fixed vocabulary plus independent 3 digits.
    # Lowercase ASCII is deliberately preferred for keyboard portability.
    from unicodedata import normalize
    words = [normalize('NFKD', secrets.choice(WORDS)).encode('ascii','ignore').decode('ascii') for _ in range(6)]
    return '-'.join(words)+'-'+str(secrets.randbelow(1000)).zfill(3)


def atomically_replace(path, payload):
    old = path.stat()
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix='.rotate-')
    try:
        os.fchmod(fd,old.st_mode & 0o777)
        os.fchown(fd,old.st_uid,old.st_gid)
        with os.fdopen(fd,'wb') as f:
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)


def auth_http(port, tls, password):
    token=base64.b64encode((LOGIN+':'+password).encode()).decode()
    if tls:
        conn=http.client.HTTPSConnection('127.0.0.1',port,timeout=8,context=ssl._create_unverified_context())
    else:
        conn=http.client.HTTPConnection('127.0.0.1',port,timeout=8)
    try:
        conn.request('GET','/',headers={'Authorization':'Basic '+token,'Host':'browser.fractavolta.com'})
        response=conn.getresponse()
        response.read(64)
        return response.status
    finally: conn.close()


def main():
    if os.geteuid()!=0: raise RuntimeError('Run with sudo on Fracta2')
    if not sys.stdout.isatty(): raise RuntimeError('Requires an interactive private terminal: no secret in tool logs')
    registry=load_registry(REGISTRY)
    matched=[w for w in registry['workspaces'] if w['login']==LOGIN and w['enabled'] and w['port']==PORT]
    if len(matched)!=1: raise RuntimeError('Maguy mapping changed unexpectedly')
    for path in (KASM,INITIAL,REGISTRY):
        if not path.is_file() or path.is_symlink():raise RuntimeError('Expected private file missing or symlink')
    if KASM.stat().st_mode & 0o077 or INITIAL.stat().st_mode & 0o077:
        raise RuntimeError('Credential permissions unexpectedly permissive')
    if not BACKUPS.exists(): BACKUPS.mkdir(mode=0o700)
    if BACKUPS.stat().st_mode & 0o077: raise RuntimeError('Backup folder not private')
    backup=BACKUPS/('maguy-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    backup.mkdir(mode=0o700)
    paths={'kasm':KASM,'initial':INITIAL,'registry':REGISTRY}
    for key,source in paths.items():
        target=backup/key
        shutil.copy2(source,target)
        target.chmod(0o600)
    newpass=candidate()
    # Prepare the updated Kasm passwd file privately before touching production.
    with tempfile.TemporaryDirectory(prefix='hosted-rotation-',dir='/root') as d:
        temp=Path(d)/'kasmpasswd'
        shutil.copy2(KASM,temp)
        result=subprocess.run(['/usr/bin/kasmvncpasswd','-u',LOGIN,'-w','-o',str(temp)],
                              input=(newpass+'\n'+newpass+'\n').encode(),
                              stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if result.returncode: raise RuntimeError('KasmVNC credential generator failed; no production change')
        if LOGIN not in [l.split(':',1)[0] for l in temp.read_text().splitlines()]:
            raise RuntimeError('New KasmVNC record not found; no production change')
        updated_kasm=temp.read_bytes()
    new_db=load_registry(REGISTRY)
    selected=next(w for w in new_db['workspaces'] if w['login']==LOGIN)
    selected['bcrypt_hash']=bcrypt.hashpw(newpass.encode(),bcrypt.gensalt()).decode()
    from core import validate_registry
    validate_registry(new_db)
    changed=False
    try:
        changed=True
        atomically_replace(KASM,updated_kasm)
        write_atomic(REGISTRY,new_db)
        atomically_replace(INITIAL,(newpass+'\n').encode())
        status_direct=auth_http(PORT,True,newpass)
        status_router=auth_http(8768,False,newpass)
        if (status_direct,status_router)!=(200,200):
            raise RuntimeError(f'Live login checks failed: direct={status_direct}, router={status_router}')
    except BaseException:
        if changed:
            for key,path in paths.items():
                atomically_replace(path,(backup/key).read_bytes())
            print('Rotation failed; original files restored from private backup.',file=sys.stderr)
        raise
    print('Maguy rotation COMPLETE. Direct KasmVNC HTTP 200, dynamic router HTTP 200.')
    print('New password (copy privately; do not publish):')
    print(newpass)
    print('Private rollback files:',backup)
    print('No Caddy reload and no browser restart was performed.')


if __name__=='__main__':
    try: main()
    except Exception as exc:
        print('Rotation unsuccessful:',str(exc),file=sys.stderr)
        sys.exit(1)
