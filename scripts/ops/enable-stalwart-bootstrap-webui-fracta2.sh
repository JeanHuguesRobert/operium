#!/usr/bin/env bash
# Operium #77: bootstrap Stalwart behind existing OCI+guest firewall;
# permit its outbound WebUI download while keeping inbound 8080 unavailable.
# Stalwart stays disabled at boot. Setup completion still gated by ExecStartPre.
set -Eeuo pipefail
unit=stalwart.service
guard=/etc/systemd/system/stalwart.service.d/10-private-bootstrap.conf
[[ -f "$guard" ]] || { echo 'REFUSE: bootstrap guard absent' >&2; exit 2; }
[[ ! -f /etc/stalwart/config.json ]] || { echo 'REFUSE: bootstrap already completed' >&2; exit 2; }
[[ $(/usr/local/bin/stalwart --version 2>&1) == 1.1.0 ]] || { echo 'REFUSE: unexpected Stalwart version'; exit 2; }
[[ $(systemctl is-enabled "$unit") == disabled ]] || { echo 'REFUSE: boot activation allowed'; exit 2; }
[[ $(systemctl is-active caddy) == active ]] || { echo 'REFUSE: Caddy inactive'; exit 2; }
[[ $(curl -sS -m 5 -o /dev/null -w '%{http_code}' https://browser.fractavolta.com/) == 401 ]] || { echo 'REFUSE: browser auth regression'; exit 2; }
# Persistent rules must not permit TCP 8080. Root also checks the live rules at apply.
[[ -r /etc/iptables/rules.v4 ]] || { echo 'REFUSE: no persistent firewall'; exit 2; }
if grep -E '^(-A INPUT|:INPUT)' /etc/iptables/rules.v4 | grep -E '(--dport 8080|--dports.*8080)' | grep -q 'ACCEPT'; then echo 'REFUSE: persistent port 8080 ACCEPT'; exit 2; fi
grep -qE '^-A INPUT -j REJECT' /etc/iptables/rules.v4 || { echo 'REFUSE: no INPUT terminal reject'; exit 2; }
if [[ "${1:-}" != --apply ]]; then
 echo 'PREFLIGHT_OK: temporary startup WebUI egress required; OCI+guest INPUT firewall still blocks 8080; no changes'; exit 0
fi
[[ $# -eq 1 && $(id -u) -eq 0 ]] || { echo 'USAGE: sudo bash enable-stalwart-bootstrap-webui-fracta2.sh --apply'; exit 2; }
# Check active firewall, not only the persisted saved version.
/usr/sbin/iptables -w -C INPUT -j REJECT --reject-with icmp-host-prohibited
if /usr/sbin/iptables -w -S INPUT | grep -E -- '(-j ACCEPT.*--dport 8080|--dport 8080.*-j ACCEPT|-A INPUT -j ACCEPT)' >/dev/null; then echo 'REFUSE: live port 8080 may be open'; exit 3; fi
backup=$(mktemp /etc/systemd/system/stalwart.service.d/10-private-bootstrap.conf.bak-XXXXXXXX)
cp -a "$guard" "$backup"
rollback(){ cp -a "$backup" "$guard"; systemctl daemon-reload; systemctl stop "$unit" >/dev/null 2>&1 || true; systemctl disable "$unit" >/dev/null 2>&1 || true; echo 'ROLLBACK: Stalwart stopped with original sandbox restored' >&2; }
trap rollback ERR
cat > "$guard" <<'CONF'
[Service]
# BOOTSTRAP ONLY: outbound WebUI download requires network; guest firewall's
# terminal INPUT REJECT and OCI ingress policy protect the initial wizard.
# This unit is NOT enabled at boot. Once wizard writes config.json, no restart
# is possible until listeners are manually reviewed and this guard removed.
IPAddressDeny=
IPAddressAllow=
ExecStartPre=/usr/bin/test ! -e /etc/stalwart/config.json
NoNewPrivileges=true
CONF
systemctl daemon-reload
systemctl restart "$unit"
[[ $(systemctl is-active "$unit") == active ]] || { echo 'Stalwart not active'; exit 3; }
[[ $(systemctl is-enabled "$unit") == disabled ]] || { echo 'Stalwart enabled unexpectedly'; exit 3; }
code=000
for i in $(seq 1 20); do
 code=$(curl -sS -m 4 -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/admin/ 2>/dev/null || true)
 [[ $code == 200 ]] && break
 sleep 2
done
[[ "$code" == 200 ]] || { echo "WebUI failed: HTTP $code" >&2; exit 3; }
for port in 25 465 587 993; do
 if ss -ltn | grep -Eq ":$port[[:space:]]"; then echo "REFUSE: mail protocol listener :$port" >&2; exit 3; fi
done
[[ $(curl -sS -m 6 -o /dev/null -w '%{http_code}' https://browser.fractavolta.com/) == 401 ]] || { echo 'Browser regression'; exit 3; }
trap - ERR
printf 'PASS: /admin/ HTTP 200, Stalwart bootstrap active but disabled, public 8080 firewall blocked, mail ports closed, Caddy/browser healthy.\n'
printf 'NEXT: open http://127.0.0.1:8080/admin/ from the Fracta2 hosted browser; do not restart/enable Stalwart after wizard without reviewing listeners.\n'
