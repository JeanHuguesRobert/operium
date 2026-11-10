#!/usr/bin/env bash
# Start *only* Stalwart's initial wizard with the admin surface restricted
# to local sockets. A generated configuration cannot be restarted until vetted.
# Never enable unit at boot or open SMTP during this stage.
set -Eeuo pipefail
unit=stalwart.service
guard=/etc/systemd/system/stalwart.service.d/10-private-bootstrap.conf
[[ -x /usr/local/bin/stalwart && $(/usr/local/bin/stalwart --version 2>&1) == 1.1.0 ]] || { echo 'REFUSE: Stalwart v1.1.0 required'; exit 2; }
[[ ! -e /etc/stalwart/config.json ]] || { echo 'REFUSE: already configured, no bootstrap'; exit 2; }
[[ $(systemctl is-enabled "$unit") == disabled ]] || { echo 'REFUSE: unit is enabled'; exit 2; }
[[ $(systemctl is-active "$unit") == inactive ]] || { echo 'REFUSE: unit not inactive'; exit 2; }
[[ $(systemctl is-active caddy.service) == active ]] || { echo 'REFUSE: Caddy inactive'; exit 2; }
[[ $(curl -sS -m 6 -o /dev/null -w '%{http_code}' https://browser.fractavolta.com/) == 401 ]] || { echo 'REFUSE: browser unavailable'; exit 2; }
[[ ! -e "$guard" ]] || { echo 'REFUSE: guard exists'; exit 2; }
if [[ "${1:-}" != --apply ]]; then
 echo 'PREFLIGHT_OK: Stalwart is stopped/unconfigured; private bootstrap guard ready'; exit 0
fi
[[ $# -eq 1 && $(id -u) -eq 0 ]] || { echo 'USAGE: sudo bash start-stalwart-private-bootstrap-fracta2.sh --apply'; exit 2; }
mkdir -p "$(dirname "$guard")"
cat > "$guard" <<'CONF'
[Service]
# Only local clients may access bootstrap setup UI, regardless of bind [::].
IPAddressDeny=any
IPAddressAllow=localhost
# Initial setup writes config.json but MUST NOT restart with unsafe default
# mail/HTTPS listeners until an operator explicitly vets NetworkListeners.
ExecStartPre=/usr/bin/test ! -e /etc/stalwart/config.json
NoNewPrivileges=true
CONF
fail(){ echo 'FAILED: leaving Stalwart stopped/disabled (bootstrap guard retained)' >&2; systemctl stop "$unit" >/dev/null 2>&1 || true; systemctl disable "$unit" >/dev/null 2>&1 || true; }
trap fail EXIT
systemctl daemon-reload
systemctl start "$unit"
[[ $(systemctl is-active "$unit") == active ]] || { echo 'Stalwart did not start'; exit 3; }
[[ $(systemctl is-enabled "$unit") == disabled ]] || { echo 'Unexpected enablement'; exit 3; }
[[ $(systemctl show "$unit" -p IPAddressDeny --value) == *0.0.0.0/0* ]] || { echo 'Address-deny ineffective'; exit 3; }
[[ $(systemctl show "$unit" -p IPAddressAllow --value) == *127.0.0.0/8* ]] || { echo 'Address-allow ineffective'; exit 3; }
code=$(curl -s -o /dev/null -m 8 -w '%{http_code}' http://127.0.0.1:8080/admin)
[[ "$code" == 200 || "$code" == 302 || "$code" == 401 ]] || { echo "Wizard not reachable HTTP $code"; exit 3; }
for port in 25 465 443 993; do
 if [[ "$port" == 443 ]]; then continue; fi
 if ss -ltn | grep -Eq ":${port}[[:space:]]"; then echo "Unexpected mail port $port"; exit 3; fi
done
[[ $(curl -sS -m 6 -o /dev/null -w '%{http_code}' https://browser.fractavolta.com/) == 401 ]] || { echo 'Browser regression'; exit 3; }
trap - EXIT
echo 'PASS: Stalwart temporary setup UI reachable on localhost:8080; systemd IP filters localhost-only; unit disabled; no mail listeners; Caddy/hosted browser unaffected.'
echo 'Do not restart or enable Stalwart after completing its wizard until NetworkListeners are restricted.'
