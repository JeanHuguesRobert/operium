#!/usr/bin/env bash
# Operium — Fracta public TLS edge for services.acorsica.org.
# Run on FRACTA, not Fracta2. Dry-run unless --apply is supplied by operator.
set -euo pipefail

FQDN=services.acorsica.org
CADDYFILE=/etc/caddy/Caddyfile
ORIGIN=100.84.109.87:80
APPLY=0
if [[ "${1:-}" == "--apply" && $# == 1 ]]; then APPLY=1
elif (( $# )); then echo "usage: $0 [--apply]" >&2; exit 2
fi
[[ -f "$CADDYFILE" ]] || { echo "BLOCKED: Caddyfile missing"; exit 2; }
command -v caddy >/dev/null || { echo "BLOCKED: Caddy executable missing"; exit 2; }
if grep -Eq '(^|[[:space:]])services[.]acorsica[.]org([[:space:],{]|$)' "$CADDYFILE"; then
  echo "BLOCKED: hostname already declared; inspect existing routing"
  exit 2
fi
# Caddyfile.d imports may already provide it; refuse duplicate registrations.
if grep -R -E -q '^([[:space:]]*)services[.]acorsica[.]org([[:space:],{]|$)' /etc/caddy/Caddyfile.d 2>/dev/null; then
  echo "BLOCKED: hostname already defined in included Caddy fragment"
  exit 2
fi

echo "PLAN: Fracta TLS edge Caddy $FQDN -> http://$ORIGIN (Host unchanged)"
echo "Validate origin before --apply: curl -H 'Host: $FQDN' http://$ORIGIN/services"
if (( ! APPLY )); then echo "DRY-RUN; nothing changed."; exit 0; fi
(( EUID == 0 )) || { echo "BLOCKED: --apply requires root"; exit 2; }

# Verify origin is ready before initiating public TLS or DNS-backed traffic.
for p in / /services /rights /kys-services.json; do
  code=$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' \
    -H "Host: $FQDN" "http://$ORIGIN$p") || {
      echo "BLOCKED: origin inaccessible for $p"; exit 2;
    }
  [[ "$code" == "200" ]] || { echo "BLOCKED: origin $p HTTP $code"; exit 2; }
done

backup="$CADDYFILE.bak.kys-services-$(date -u +%Y%m%dT%H%M%SZ)"
candidate=$(mktemp /etc/caddy/.kys-candidate.XXXXXX)
cleanup() { rm -f "$candidate"; }
trap cleanup EXIT

cat "$CADDYFILE" > "$candidate"
cat >> "$candidate" <<'EOF'

# KYS Services / Serenia — source of truth: Operium issue #76
services.acorsica.org {
    reverse_proxy http://100.84.109.87:80
}
EOF
caddy validate --config "$candidate" || { echo "BLOCKED: candidate config invalid"; exit 2; }
cp -p "$CADDYFILE" "$backup"
cp "$candidate" "$CADDYFILE"
if ! systemctl reload caddy; then
  cp -p "$backup" "$CADDYFILE"
  systemctl reload caddy || true
  echo "FAIL: reload; restored prior Caddyfile" >&2
  exit 1
fi
echo "PASS: new Fracta edge vhost installed; prior config at $backup"
echo "Verify TLS/ACME and end-to-end HTTP responses before considering deployment complete."
