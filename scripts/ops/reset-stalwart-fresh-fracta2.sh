#!/usr/bin/env bash
# Principal-authorized fresh reset of *only* the new Stalwart installation.
# Intentionally NO backup, NO preserve/rename/archive, NO old mail migration.
# Retain installed 1.1.0 binary/unit. Start a fresh private bootstrap wizard.
set -Eeuo pipefail
[[ $(id -u) == 0 && $# == 1 && $1 == --apply ]] || {
 echo 'USAGE: sudo bash reset-stalwart-fresh-fracta2.sh --apply'; exit 2;
}
[[ $(/usr/local/bin/stalwart --version 2>&1) == '1.1.0' ]] || { echo 'REFUSE: wrong Stalwart version'; exit 2; }
[[ -f /etc/systemd/system/stalwart.service && -d /etc/stalwart && -d /var/lib/stalwart ]] || {
 echo 'REFUSE: unexpected Stalwart installation paths'; exit 2;
}
[[ $(systemctl is-enabled stalwart.service) == disabled ]] || {
 echo 'REFUSE: Stalwart unit must be disabled at boot'; exit 2;
}
# The existing guest firewall must exclude Internet ingress to bootstrap :8080.
[[ -r /etc/iptables/rules.v4 ]] || { echo 'REFUSE: persistent guest firewall missing'; exit 2; }
grep -qE '^-A INPUT -j REJECT' /etc/iptables/rules.v4 || {
 echo 'REFUSE: no guest firewall terminal INPUT REJECT'; exit 2;
}
if grep -E '^(-A INPUT|:INPUT)' /etc/iptables/rules.v4 | grep -E '(--dport 8080|--dports.*8080)' | grep -q ACCEPT; then
 echo 'REFUSE: 8080 accept rule detected'; exit 2
fi
/usr/sbin/iptables -w -C INPUT -j REJECT --reject-with icmp-host-prohibited
if /usr/sbin/iptables -w -S INPUT | grep -E -- '(-j ACCEPT.*--dport 8080|--dport 8080.*-j ACCEPT|-A INPUT -j ACCEPT)' >/dev/null; then
 echo 'REFUSE: firewall may expose bootstrap'; exit 2
fi
# Stop the exact Stalwart unit first; never touch Caddy or another service.
systemctl stop stalwart.service
systemctl disable stalwart.service >/dev/null
# Destructive by design: full contents of Stalwart-specific config, state and
# prior Stalwart-only backups. No copies, snapshots, previous accounts or data.
find /etc/stalwart -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
find /var/lib/stalwart -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
chown stalwart:stalwart /etc/stalwart /var/lib/stalwart
chmod 0750 /etc/stalwart /var/lib/stalwart
# Reset recovery/old bootstrap overrides. The new guard prevents any normal
# restart after the wizard creates config.json: public listeners still need
# explicit private-only configuration before normal operation.
install -d -m 0755 /etc/systemd/system/stalwart.service.d
cat > /etc/systemd/system/stalwart.service.d/10-private-bootstrap.conf <<'CONF'
[Service]
Environment=STALWART_RECOVERY_MODE=
ExecStartPre=
ExecStartPre=/usr/bin/test ! -e /etc/stalwart/config.json
# Outbound WebUI fetch required; guest firewall and OCI block inbound 8080.
IPAddressDeny=
IPAddressAllow=
NoNewPrivileges=true
CONF
# Create a new, local-only recovery/initial-setup password. Never print it.
# This is the only fresh Stalwart credential; see operator instruction below.
python3 - <<'PY'
from pathlib import Path
import secrets,os
p=Path('/etc/stalwart/stalwart.env')
fd=os.open(str(p),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:
 f.write('STALWART_RECOVERY_ADMIN=admin:'+secrets.token_urlsafe(30)+'\n')
os.chown(p, __import__('pwd').getpwnam('stalwart').pw_uid, __import__('grp').getgrnam('stalwart').gr_gid)
PY
systemctl daemon-reload
systemctl start stalwart.service
[[ $(systemctl is-active stalwart.service) == active ]] || { echo 'FAILED: Stalwart bootstrap did not start'; exit 4; }
[[ $(systemctl is-enabled stalwart.service) == disabled ]] || { echo 'FAILED: unexpected enablement'; exit 4; }
[[ ! -f /etc/stalwart/config.json ]] || { echo 'FAILED: prior state appeared'; exit 4; }
[[ ! -e /var/lib/stalwart/stalwart.db ]] || { echo 'FAILED: old DB appeared'; exit 4; }
code=000
for i in {1..15}; do
 code=$(curl -sS -m 4 -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/admin/ 2>/dev/null || :)
 [[ $code == 200 ]] && break
 sleep 2
done
[[ $code == 200 ]] || { echo "FAILED: wizard unavailable HTTP $code"; exit 4; }
for port in 25 465 587 993 995; do
 if ss -ltnH | awk '{print $4}' | grep -qE ":$port$"; then
  echo "FAILED: unexpected mail port $port"; exit 4
 fi
done
echo 'PASS: Stalwart 1.1.0 FRESH bootstrap, old config + SQLite + Stalwart backups DELETED (no snapshot), new wizard on HTTP :8080, no mail listener, disabled at boot.'
echo 'BOOTSTRAP USERNAME: admin'
echo 'BOOTSTRAP PASSWORD: read privately on the host with: sudo sed -n "s/^STALWART_RECOVERY_ADMIN=admin://p" /etc/stalwart/stalwart.env'
echo 'Do not paste that password into chat or GitHub.'
