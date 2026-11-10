#!/usr/bin/env bash
# Install HTTPS vhosts in parallel to the functioning HTTP vhosts.
# No HTTP -> HTTPS redirects until the reserved IP is moved and ACME is verified.
# Usage (owner-run on fracta2): sudo bash scripts/ops/install-fracta2-caddy-https-stage.sh [--apply]
set -Eeuo pipefail
stage=${FRACTA2_CADDY_STAGE:-/tmp/fracta2-https-stage-20261109-resume77}
root=/etc/caddy/Caddyfile
edge=/etc/caddy/fracta2-edge-https
marker='# FRACTA2_HTTPS_STAGE_77'
[ -r "$root" ] || { echo 'ERROR: missing live Caddyfile' >&2; exit 1; }
[ -d "$stage/vhosts" ] || { echo 'ERROR: missing staged vhosts' >&2; exit 1; }
[ -r "$stage/vhosts/browser-tls.caddy" ] || { echo 'ERROR: missing browser TLS authentication route' >&2; exit 1; }
if grep -Fq "$marker" "$root"; then
  echo 'ALREADY_INSTALLED: refusing second install'; exit 0
fi
# Preflight staged route configuration, including browser Basic Auth.
[ "$(find "$stage/vhosts" -maxdepth 1 -name '*-tls.caddy' | wc -l)" -eq 12 ] || { echo 'ERROR: expected 12 TLS vhosts' >&2; exit 1; }
grep -Eq 'basic_auth|basicauth' "$stage/vhosts/browser-tls.caddy" || { echo 'ERROR: browser auth missing' >&2; exit 1; }
grep -q '8444' "$stage/vhosts/browser-tls.caddy" && grep -q '8445' "$stage/vhosts/browser-tls.caddy" || { echo 'ERROR: browser user routes missing' >&2; exit 1; }
if [ "${1:-}" != --apply ]; then
  echo 'PREFLIGHT_OK: no changes; sudo bash .../install-fracta2-caddy-https-stage.sh --apply to install'; exit 0
fi
[ "$(id -u)" -eq 0 ] || { echo 'ERROR: owner-run sudo root required' >&2; exit 1; }
[ ! -e "$edge" ] || { echo 'ERROR: TLS edge destination already exists' >&2; exit 1; }
backup=$(mktemp -p /etc/caddy Caddyfile.backup-77-XXXXXXXX)
chmod 600 "$backup"
cp -a "$root" "$backup"
rollback() {
  echo 'ROLLBACK: restoring original Caddyfile' >&2
  cp -a "$backup" "$root"
  caddy validate --config "$root" --adapter caddyfile >/dev/null 2>&1 || true
  systemctl reload caddy >/dev/null 2>&1 || true
  if [ -d "$edge" ]; then rm -rf -- "$edge"; fi
}
trap 'rollback' ERR
install -d -m 755 "$edge"
for f in "$stage"/vhosts/*-tls.caddy; do install -m 644 "$f" "$edge/$(basename "$f")"; done
# Put the global options at top; keep the entire previous Caddyfile verbatim otherwise.
candidate=$(mktemp -p /etc/caddy Caddyfile.candidate-77-XXXXXXXX)
{
  printf '{\n  auto_https disable_redirects\n}\n%s\nimport %s/*.caddy\n' "$marker" "$edge"
  cat "$backup"
} > "$candidate"
chmod 644 "$candidate"
caddy validate --config "$candidate" --adapter caddyfile
mv -f "$candidate" "$root"
systemctl reload caddy
sleep 1
[ "$(systemctl is-active caddy)" = active ]
ss -ltn | grep -qE '[:.]443[[:space:]]'
curl -fsS -o /dev/null --max-time 8 -H 'Host: capable.lepp.fr' http://127.0.0.1/
[ "$(curl -s -o /dev/null --max-time 8 -w '%{http_code}' -H 'Host: browser.fractavolta.com' http://127.0.0.1/)" = 401 ]
trap - ERR
printf 'INSTALLED CADDY TLS STAGE; backup=%s; HTTP remains available; 443 listener verified\n' "$backup"
