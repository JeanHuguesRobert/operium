#!/usr/bin/env bash
# Operium #77: restore known public services, never expose internal Magistral.
# Dry-run by default; explicitly owner-executed sudo --apply.
set -Eeuo pipefail
root=/srv/cogentia/repos/operium
src="$root/templates/fracta2-public-edge"
target=/etc/caddy/fracta2-edge-https
live=/etc/caddy/Caddyfile
for f in cogentia fracta services; do
  [[ -s "$src/$f.caddy" ]] || { echo "MISSING template $f" >&2; exit 2; }
  [[ ! -e "$target/$f.caddy" ]] || { echo "REFUSE existing public route $f" >&2; exit 2; }
done
[[ -d "$target" && -f "$live" ]] || { echo 'HTTPS stage is not installed' >&2; exit 2; }
[[ $(systemctl is-active mcp-cogentia.service) == active ]] || { echo 'MCP inactive' >&2; exit 2; }
[[ $(systemctl is-active fractavolta-mobile-energy-sim.service) == active ]] || { echo 'Simulator inactive' >&2; exit 2; }
[[ $(curl -s -o /dev/null -m 5 -w '%{http_code}' http://127.0.0.1:8791/guide/) == 200 ]] || { echo 'Guide probe failed' >&2; exit 2; }
[[ $(curl -s -o /dev/null -m 5 -w '%{http_code}' http://100.84.109.87:8502/simulateur/) == 200 ]] || { echo 'Simulator probe failed' >&2; exit 2; }
bash "$root/scripts/deploy-kys-services-origin-fracta2.sh"
# Validate composed Caddyfile with staged templates without modifying live.
candidate=$(mktemp /tmp/fracta2-public-caddy-77.XXXXXXXX)
trap 'rm -f "$candidate"' EXIT
{ cat "$live"; printf '\nimport %s/*.caddy\n' "$src"; } > "$candidate"
caddy validate --config "$candidate" --adapter caddyfile >/dev/null
if [[ "${1:-}" != --apply ]]; then
  echo 'PREFLIGHT_OK: three HTTPS public facades validated; no system changes'; exit 0
fi
[[ $# -eq 1 && $(id -u) -eq 0 ]] || { echo 'Usage: sudo bash publish-fracta2-public-facades.sh --apply' >&2; exit 2; }
# Stage KYS HTTP app first, preserving app release's strict asset-404 behavior.
bash "$root/scripts/deploy-kys-services-origin-fracta2.sh" --apply
installed=()
rollback() {
  echo 'ERROR: restoring previous HTTPS public routing' >&2
  for f in "${installed[@]}"; do rm -f -- "$target/$f.caddy"; done
  systemctl reload caddy || true
}
trap 'rollback' ERR
for f in cogentia fracta services; do
  install -m 644 "$src/$f.caddy" "$target/$f.caddy"
  installed+=("$f")
done
caddy validate --config "$live" --adapter caddyfile >/dev/null
systemctl reload caddy
# Check routes via HTTP servers through admin load; HTTPS ACME can take time.
for path in /guide/ /ops/status /cop/health; do
  code=$(curl -ksS -o /dev/null -m 12 -w '%{http_code}' --resolve cogentia.fractavolta.com:443:127.0.0.1 "https://cogentia.fractavolta.com$path") || code=000
  if [[ "$code" == 000 ]]; then echo "TLS still pending $path (Caddy ACME)"; else echo "HTTPS $path $code"; fi
done
trap - ERR
printf 'PUBLISHED: Cogentia Guide/COP, Fracta simulator, KYS Services. Check public TLS and routes.\n'
