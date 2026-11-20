"""One-time migration: import existing *hashed* Basic-auth identities from Caddy.
Must run as host administrator. Never prints or commits hashes.
"""
import os
from pathlib import Path
import re
import json

source=Path('/etc/caddy/fracta2-edge-https/browser-tls.caddy').read_text()
workspaces=[]
for login, ident, port in (('jeanhuguesrobert','jhn',8444),('frederic','fred',8445),('maguy','maguy',8446)):
    matches=re.findall(r'^\s*'+re.escape(login)+r'\s+(\$2[aby]\$\S+)',source,re.M)
    if len(matches)!=1: raise SystemExit('expected one existing bcrypt identity for '+ident)
    workspaces.append({'id':ident,'login':login,'bcrypt_hash':matches[0], 'host':'127.0.0.1','port':port,'enabled':True})
path=Path('/etc/operium/hosted-browser/router.json')
if path.exists():
    raise SystemExit('registry already exists; refusing overwrite')
flags=os.O_WRONLY|os.O_CREAT|os.O_EXCL
fd=os.open(path, flags,0o640)
try:
    with os.fdopen(fd,'w') as f:
        json.dump({'version':1,'workspaces':workspaces},f)
        f.write('\n')
except Exception:
    path.unlink(missing_ok=True)
    raise
print('Imported 3 hash references; secret values suppressed')
