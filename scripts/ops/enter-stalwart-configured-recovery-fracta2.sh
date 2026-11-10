#!/usr/bin/env bash
# Finish Stalwart 1.1 bootstrap safely: keep existing SQLite, enter recovery mode
# on :8080 only to configure private NetworkListeners BEFORE a normal restart.
# Must be run as owner-root; no passwords printed, no external mail or public ports.
# Fresh-install reset: no snapshots, backups or archival state.
set -Eeuo pipefail
service=stalwart.service
dropin=/etc/systemd/system/stalwart.service.d/10-private-bootstrap.conf
config=/etc/stalwart/config.json
db=/var/lib/stalwart/stalwart.db
[[ $(id -u) -eq 0 ]] || { echo 'REFUSE: root required'; exit 2; }
[[ $(/usr/local/bin/stalwart --version 2>&1) == '1.1.0' ]] || { echo 'REFUSE: unexpected Stalwart version'; exit 2; }
[[ $(systemctl is-enabled "$service") == disabled ]] || { echo 'REFUSE: Stalwart is not disabled at boot'; exit 2; }
[[ $(systemctl is-active "$service") == active ]] || { echo 'REFUSE: Stalwart not active in bootstrap'; exit 2; }
[[ -f $config && -f $db && -f $dropin ]] || { echo 'REFUSE: expected config/SQLite/guard missing'; exit 2; }
[[ $(curl -s -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/admin/) == 200 ]] || { echo 'REFUSE: bootstrap UI not HTTP 200'; exit 2; }
python3 - "$config" <<'PY'
import json,sys
c=json.load(open(sys.argv[1]))
assert c.get('@type')=='Sqlite' and c.get('path')=='/var/lib/stalwart/', 'unexpected datastore; refuse'
print('CONFIG_OK: SQLite datastore path matches expected installation')
PY
if [[ ${1:-} != --apply ]]; then
  echo 'PREFLIGHT_OK: existing configuration and SQLite ready; service can enter bounded recovery mode'; exit 0
fi
[[ $# -eq 1 ]] || { echo 'USAGE: sudo bash enter-stalwart-configured-recovery-fracta2.sh --apply'; exit 2; }
# Fresh setup: no backup or snapshot (Principal explicitly requested no safety net).
systemctl stop "$service"
# Preserve the same guard position, but make this configured-only and recovery-only.
cat > "$dropin" <<'CONF'
[Service]
# CONFIGURED RECOVERY ONLY: keep all normal mail listeners closed while
# reviewing NetworkListener entries. NOT enabled at boot.
# After listeners are explicitly restricted, replace this drop-in before normal restart.
Environment=STALWART_RECOVERY_MODE=true
ExecStartPre=
ExecStartPre=/usr/bin/test -s /etc/stalwart/config.json
# WebUI bundle requires outbound download at start (guest INPUT/OCI block :8080).
IPAddressDeny=
IPAddressAllow=
NoNewPrivileges=true
CONF
systemctl daemon-reload
systemctl start "$service"
if [[ $(systemctl is-active "$service") != active ]]; then
 echo 'RECOVERY_FAILED: Stalwart service did not start; SQLite and config are retained' >&2
 exit 4
fi
sleep 1
[[ $(systemctl is-enabled "$service") == disabled ]] || { echo 'REFUSE: unexpected boot enablement'; exit 4; }
code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/admin/)
[[ "$code" == 200 ]] || { echo "RECOVERY_UNAVAILABLE: /admin/ HTTP $code"; exit 4; }
# No public mail protocols; Stalwart recovery runs over HTTP on localhost:8080.
# Caddy/HTTPS is unrelated to this private Stalwart operation.
for port in 25 465 587 993 995 4190; do
 if ss -ltnH | awk '{print $4}' | grep -qE ":${port}$"; then echo "REFUSE: mail listener :$port unexpectedly present"; exit 4; fi
done
echo "PASS: configured recovery running with existing SQLite; /admin/=200; no mail listeners; unit disabled."
echo 'NEXT: sign in with the permanent administrator configured in the wizard and restrict NetworkListeners before normal-mode restart.'
