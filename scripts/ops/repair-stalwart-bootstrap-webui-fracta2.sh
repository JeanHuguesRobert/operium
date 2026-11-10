#!/usr/bin/env bash
# One-time Stalwart bootstrap WebUI acquisition. No public mail service.
# During download only, grant Stalwart egress; guest firewall still blocks
# inbound :8080. Re-apply localhost-only systemd sandbox and verify /admin/.
set -Eeuo pipefail
unit=stalwart.service
guard=/etc/systemd/system/stalwart.service.d/10-private-bootstrap.conf
sha=152a63f34bb2f470c32fe9c68f97e395994c761303364b392a2ce419b2f06162
webui=/srv/cogentia/work/stalwart-bootstrap-20261110/webui.zip
[[ -s "$webui" ]] || { echo 'MISSING downloaded WebUI archive' >&2; exit 2; }
printf '%s  %s\n' "$sha" "$webui" | sha256sum -c --status || { echo 'WebUI SHA256 mismatch' >&2; exit 2; }
[[ ! -e /etc/stalwart/config.json ]] || { echo 'Configured Stalwart: refuse bootstrap' >&2; exit 2; }
[[ -f "$guard" ]] || { echo 'Missing bootstrap systemd drop-in' >&2; exit 2; }
[[ $(systemctl is-enabled "$unit") == disabled ]] || { echo 'Stalwart unit must stay disabled' >&2; exit 2; }
[[ $(systemctl is-active caddy) == active ]] || { echo 'Caddy not active' >&2; exit 2; }
[[ $(curl -sS -m 6 -o /dev/null -w '%{http_code}' https://browser.fractavolta.com/) == 401 ]] || { echo 'Browser regression before apply' >&2; exit 2; }
[[ $(systemctl show "$unit" -p IPAddressDeny --value) == *0.0.0.0/0* ]] || { echo 'Unexpected systemd deny state' >&2; exit 2; }
[[ $(systemctl show "$unit" -p IPAddressAllow --value) == *127.0.0.0/8* ]] || { echo 'Unexpected systemd allow state' >&2; exit 2; }
if [[ "${1:-}" != --apply ]]; then
  echo 'PREFLIGHT_OK: normalized systemd IP filter is effective; WebUI zip independently staged; can perform bounded bootstrap-only network acquisition'; exit 0
fi
[[ $# -eq 1 && $(id -u) -eq 0 ]] || { echo 'USAGE: sudo bash repair-stalwart-bootstrap-webui-fracta2.sh --apply' >&2; exit 2; }
# Require the live OCI guest firewall to reject any non-loopback 8080 ingress.
/usr/sbin/iptables -w -C INPUT -j REJECT --reject-with icmp-host-prohibited || { echo 'Missing guest firewall reject' >&2; exit 3; }
if /usr/sbin/iptables -w -S INPUT | grep -E -- '(-j ACCEPT.*--dport 8080|--dport 8080.*-j ACCEPT|-A INPUT -j ACCEPT)' >/dev/null; then
  echo 'Refuse: public port 8080 might be open' >&2; exit 3
fi
# Check live 8080 is not reachable on the public interface, not just DNS.
# A localhost-origin attempt may fail due OCI hairpin; firewall is authoritative.
backup=$(mktemp /etc/systemd/system/stalwart.service.d/10-private-bootstrap.conf.bak-XXXXXXXX)
cp -a "$guard" "$backup"
restore(){
  cp -a "$backup" "$guard"
  systemctl daemon-reload
  systemctl stop "$unit" >/dev/null 2>&1 || true
  if [[ ! -e /etc/stalwart/config.json ]]; then systemctl start "$unit" >/dev/null 2>&1 || true; fi
  systemctl disable "$unit" >/dev/null 2>&1 || true
}
trap restore EXIT
# Only lift systemd's egress *during the download*; OCI + guest INPUT reject
# prevents public access to the bootstrap wizard during this brief period.
cat > "$guard" <<'CONF'
[Service]
ExecStartPre=/usr/bin/test ! -e /etc/stalwart/config.json
NoNewPrivileges=true
CONF
systemctl daemon-reload
systemctl restart "$unit"
ready=0
for i in $(seq 1 15); do
 code=$(curl -sS -m 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/admin/ 2>/dev/null || true)
 if [[ $code == 200 ]]; then ready=1; break; fi
 sleep 2
done
if [[ $ready -ne 1 ]]; then echo 'WebUI download did not complete; restoring private guard' >&2; exit 4; fi
restore
trap - EXIT
[[ $(systemctl is-enabled "$unit") == disabled ]] || { echo 'ERROR: unit unexpectedly enabled' >&2; exit 4; }
[[ $(systemctl show "$unit" -p IPAddressDeny --value) == *0.0.0.0/0* ]] || { echo 'ERROR: filter not restored'; exit 4; }
[[ $(systemctl show "$unit" -p IPAddressAllow --value) == *127.0.0.0/8* ]] || { echo 'ERROR: allow not restored'; exit 4; }
code=$(curl -sS -m 6 -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/admin/)
[[ "$code" == 200 ]] || { echo "WebUI is not available after restoring private guard: HTTP $code"; exit 4; }
[[ $(curl -sS -m 6 -o /dev/null -w '%{http_code}' https://browser.fractavolta.com/) == 401 ]] || { echo 'ERROR: browser regression'; exit 4; }
echo "PASS: Stalwart admin UI HTTP $code, private systemd IP filters restored, unit disabled; Caddy/browser preserved. Do not complete setup until listener plan is reviewed."
