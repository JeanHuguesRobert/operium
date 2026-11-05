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
# Reuse the *real* default browser route, including authentication and
# per-user upstream selection. The initial prototype silently removed
# Basic Auth from both the HTTP fallback and the new HTTPS browser host.
live_root = Path('/etc/caddy/Caddyfile').read_text()
match = re.search(r'(?m)^:80\s*\{', live_root)
assert match, 'live HTTP fallback block missing; fail closed'
level = 0
stop = None
for i in range(match.start(), len(live_root)):
    if live_root[i] == '{': level += 1
    elif live_root[i] == '}':
        level -= 1
        if level == 0:
            stop = i + 1
            break
assert stop is not None, 'unbalanced live fallback'
fallback = live_root[match.start():stop]
assert 'basicauth' in fallback or 'basic_auth' in fallback, 'live browser authentication missing; fail closed'
assert 'reverse_proxy' in fallback, 'live browser upstream missing; fail closed'
(out/'vhosts'/'browser-tls.caddy').write_text(
    fallback.replace(':80 {', 'https://browser.fractavolta.com {', 1) + '\n'
)
root = '{\n auto_https disable_redirects\n}\n'
root += 'import ' + str(out) + '/vhosts/*.caddy\n'
root += fallback + '\n'
(out/'Caddyfile').write_text(root)
subprocess.run(['caddy','validate','--adapter','caddyfile','--config',str(out/'Caddyfile')],check=True,stdout=subprocess.DEVNULL)
print('VALID:',out/'Caddyfile','HTTP:',len(vhosts),'HTTPS:',len(vhosts)+1,'LIVE_UNCHANGED')
