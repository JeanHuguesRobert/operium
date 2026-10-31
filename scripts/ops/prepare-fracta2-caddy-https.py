#!/usr/bin/env python3
"""Generate and validate a separate HTTPS Caddy staging tree. Never deploy."""
from pathlib import Path
import subprocess
import re
import sys
src = Path(sys.argv[1] if len(sys.argv)>1 else '/etc/caddy/Caddyfile.d')
out = Path(sys.argv[2] if len(sys.argv)>2 else '/tmp/fracta2-https-stage')
assert src.is_dir() and not out.exists(), 'missing input or output already exists'
vhosts = list(sorted(src.glob('*.caddy')))
assert vhosts, 'no Caddy hosts'
(out/'vhosts').mkdir(parents=True)
for f in vhosts:
    data = f.read_text()
    (out/'vhosts'/f.name).write_text(data)
    (out/'vhosts'/(f.stem+'-tls.caddy')).write_text(re.sub(r'(?m)^([^\n{}]*http://[^\n{}]*\{)', lambda m: m.group(1).replace('http://','https://'), data))
(out/'vhosts'/'browser-tls.caddy').write_text('https://browser.fractavolta.com {\n reverse_proxy 127.0.0.1:8444 {\n transport http {\n tls_insecure_skip_verify\n }\n }\n}\n')
root='{\n auto_https disable_redirects\n}\n'
root += 'import '+str(out)+'/vhosts/*.caddy\n'
root += ':80 {\n @soma path /.well-known/soma /soma/*\n handle @soma {\n reverse_proxy 127.0.0.1:8794\n }\n handle {\n reverse_proxy 127.0.0.1:8444 {\n transport http {\n tls_insecure_skip_verify\n }\n }\n }\n}\n'
(out/'Caddyfile').write_text(root)
subprocess.run(['caddy','validate','--adapter','caddyfile','--config',str(out/'Caddyfile')],check=True,stdout=subprocess.DEVNULL)
print('VALID:',out/'Caddyfile','HTTP:',len(vhosts),'HTTPS:',len(vhosts)+1,'LIVE_UNCHANGED')
