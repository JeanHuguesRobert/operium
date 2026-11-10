#!/usr/bin/env bash
# Reopen only HTTP/HTTPS on the OCI Ubuntu guest firewall after reserved IP move.
# Idempotent, preserves all other filter rules and SSH/Tailscale control.
# Apply (owner-run): sudo bash /srv/cogentia/repos/operium/scripts/ops/enable-fracta2-public-web-iptables.sh --apply
set -Eeuo pipefail
ipt=/usr/sbin/iptables
save=/usr/sbin/iptables-save
persist=/etc/iptables/rules.v4
if [[ "${1:-}" != --apply ]]; then
  echo 'PREFLIGHT: no modifications; pass --apply as root to open TCP destination 80/443'; exit 0
fi
[[ $(id -u) -eq 0 ]] || { echo 'ERROR: root required'; exit 2; }
[[ -x $ipt && -x $save && -f $persist ]] || { echo 'ERROR: iptables or persistent rules missing'; exit 2; }
# The persistent OCI firewall must have a terminal REJECT rule and allow SSH.
$ipt -w -C INPUT -p tcp -m state --state NEW --dport 22 -j ACCEPT || { echo 'ERROR: expected SSH allow missing'; exit 3; }
$ipt -w -C INPUT -j REJECT --reject-with icmp-host-prohibited || { echo 'ERROR: expected final reject missing'; exit 3; }
# Insert before everything (including final REJECT), only explicit web ports.
for port in 80 443; do
  if $ipt -w -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null; then
    echo "ALREADY_ALLOWED tcp/$port"
  else
    $ipt -w -I INPUT 1 -p tcp -m state --state NEW --dport "$port" -j ACCEPT
    echo "ALLOWED tcp/$port"
  fi
done
# Persist the complete current ruleset atomically, retaining other OCI rules.
# Use a temp file in the same filesystem; abort if generated contents lose SSH.
tmp=$(mktemp -p /etc/iptables rules.v4.web77-XXXXXXXX)
trap 'rm -f -- "$tmp"' EXIT
$save > "$tmp"
for port in 22 80 443; do
  grep -Eq -- "^-A INPUT .*--dport ${port} -j ACCEPT$" "$tmp" || { echo "ERROR: persisted rule $port missing"; exit 4; }
done
chmod 644 "$tmp"
chown root:root "$tmp"
mv -f "$tmp" "$persist"
trap - EXIT
# Caddy and both KasmVNC private endpoints must remain present.
[[ $(systemctl is-active caddy) == active ]] || { echo 'ERROR: Caddy inactive'; exit 5; }
for port in 80 443; do ss -ltn | grep -Eq ":${port}[[:space:]]" || { echo "ERROR: :${port} not listening"; exit 5; }; done
code=$(curl -sS -o /dev/null --max-time 5 -w '%{http_code}' -H 'Host: browser.fractavolta.com' http://127.0.0.1/)
[[ "$code" == 401 ]] || { echo "ERROR: browser route auth response $code, expected 401"; exit 5; }
echo 'PASS: web ingress 80/443 enabled and saved, SSH preserved, browser Basic Auth still 401; check HTTPS/ACME externally'
