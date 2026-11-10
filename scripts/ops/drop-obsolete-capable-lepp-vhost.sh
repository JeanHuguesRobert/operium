#!/usr/bin/env bash
# Fracta2 #77: stop futile ACME for NXDOMAIN capable.lepp.fr.
# Preserve canonical capable.acorsica.org and every other vhost.
set -Eeuo pipefail
https=/etc/caddy/fracta2-edge-https/capable-tls.caddy
http=/etc/caddy/Caddyfile.d/capable.caddy
old='https://capable.lepp.fr, https://capable.acorsica.org {'
new='https://capable.acorsica.org {'
oldhttp='http://capable.lepp.fr, http://capable.acorsica.org {'
newhttp='http://capable.acorsica.org {'
for f in "$https" "$http"; do [[ -f "$f" ]] || { echo "MISSING $f" >&2; exit 2; }; done
[[ $(head -n1 "$https") == "$old" && $(head -n1 "$http") == "$oldhttp" ]] || { echo 'REFUSE: Unexpected Capable vhost contents' >&2; exit 2; }
if [[ "${1:-}" != --apply ]]; then
  echo 'PREFLIGHT_OK: will remove only obsolete capable.lepp.fr TLS and HTTP aliases'; exit 0
fi
[[ $# -eq 1 && $(id -u) -eq 0 ]] || { echo 'USAGE: sudo bash drop-obsolete-capable-lepp-vhost.sh --apply' >&2; exit 2; }
backup=$(mktemp -d /etc/caddy/capable-alias-77-XXXXXXXX)
cp -a "$https" "$http" "$backup/"
rollback(){ echo 'ROLLBACK: Capable vhosts' >&2; cp -a "$backup/capable-tls.caddy" "$https"; cp -a "$backup/capable.caddy" "$http"; systemctl reload caddy || true; }
trap rollback ERR
sed -i '1c\https://capable.acorsica.org {' "$https"
sed -i '1c\http://capable.acorsica.org {' "$http"
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl reload caddy
code=$(curl -fsS --max-time 10 -o /dev/null -w '%{http_code}' https://capable.acorsica.org/)
[[ "$code" == 200 ]] || { echo "FAIL canonical HTTPS=$code" >&2; exit 3; }
code=$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' https://browser.fractavolta.com/)
[[ "$code" == 401 ]] || { echo "FAIL browser auth=$code" >&2; exit 3; }
trap - ERR
echo "PASS: Capable canonical HTTPS 200, browser auth 401, obsolete NXDOMAIN alias removed; backup=$backup"
