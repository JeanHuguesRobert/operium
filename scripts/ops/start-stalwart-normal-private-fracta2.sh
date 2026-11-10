#!/usr/bin/env bash
# Operium #77: transition configured Stalwart from recovery to private normal mode.
# No archive/snapshot, no TLS/cert changes, no email, no boot enable.
set -Eeuo pipefail
unit=stalwart.service
guard=/etc/systemd/system/stalwart.service.d/10-private-bootstrap.conf
[[ $(id -u) == 0 && $# == 1 && ${1:-} == --apply ]] || { echo 'USAGE: sudo bash start-stalwart-normal-private-fracta2.sh --apply'; exit 2; }
[[ $(/usr/local/bin/stalwart --version 2>&1) == 1.1.0 ]] || { echo 'REFUSE: unexpected version'; exit 2; }
[[ -f /etc/stalwart/config.json && -f /var/lib/stalwart/stalwart.db && -f "$guard" ]] || { echo 'REFUSE: missing install files'; exit 2; }
[[ $(systemctl is-active "$unit") == active && $(systemctl is-enabled "$unit") == disabled ]] || { echo 'REFUSE: service not active/disabled'; exit 2; }
[[ $(systemctl show -p Environment --value "$unit") == *STALWART_RECOVERY_MODE=true* ]] || { echo 'REFUSE: service not in expected recovery mode'; exit 2; }
# Ask the actual running server, not documentation, for persisted listener settings.
python3 - <<'PY'
import json,base64,urllib.request
from pathlib import Path
secrets=dict(x.split('=',1) for x in Path('/etc/stalwart/stalwart.env').read_text().splitlines() if '=' in x and not x.startswith('#'))
credential=secrets.get('STALWART_RECOVERY_ADMIN','')
assert credential.startswith('admin:') and len(credential)>8, 'missing recovery credential'
auth='Basic '+base64.b64encode(credential.encode()).decode()
body=json.dumps({'using':['urn:ietf:params:jmap:core','urn:stalwart:jmap'], 'methodCalls':[['x:NetworkListener/get',{'ids':None},'l1']]}).encode()
req=urllib.request.Request('http://127.0.0.1:8080/jmap',data=body,headers={'Authorization':auth,'Content-Type':'application/json'},method='POST')
with urllib.request.urlopen(req,timeout=8) as resp: result=json.load(resp)
items=[entry for name,entry,cid in result.get('methodResponses',[]) if cid=='l1' and name=='x:NetworkListener/get']
assert len(items)==1, 'cannot verify listener configuration'
listeners=items[0].get('list',[])
assert len(listeners)==1, 'expected exactly one configured listener'
listener=listeners[0]
assert listener.get('name')=='http-private' and listener.get('protocol')=='http', 'unexpected listener name/protocol'
assert listener.get('bind')=={'127.0.0.1:8080':True}, 'listener is not localhost-only'
assert listener.get('implicitTls') is False and listener.get('useTls') is False, 'unexpected TLS configuration'
print('PREFLIGHT_OK: single explicit localhost HTTP listener, TLS off')
PY
# No need to preserve an inert/incorrect recovery drop-in; return to normal
# with only a configured-only gate. The credential file is not printed.
systemctl stop "$unit"
cat > "$guard" <<'CONF'
[Service]
# Normal private Stalwart. Never start with absent configuration.
# Keep unit disabled at boot until operational validation is complete.
UnsetEnvironment=STALWART_RECOVERY_MODE
ExecStartPre=
ExecStartPre=/usr/bin/test -s /etc/stalwart/config.json
IPAddressDeny=
IPAddressAllow=
NoNewPrivileges=true
CONF
systemctl daemon-reload
systemctl start "$unit"
sleep 1
if [[ $(systemctl is-active "$unit") != active ]]; then
 echo 'FAILED: normal Stalwart failed to start (unit disabled); check journalctl -u stalwart' >&2
 exit 4
fi
# Independently reject any Stalwart public/mail socket or non-loopback 8080.
if ss -ltnH | awk '{print $4}' | grep -Eq '(^|:)(25|465|587|993|995|4190|2525)$'; then
 echo 'FAILED: unexpected mail socket, stopping Stalwart' >&2;systemctl stop "$unit";exit 5
fi
if ss -ltnH | awk '{print $4}' | grep -Eq '^([^1]|127\\.0\\.0\\.[^1]).*:8080$|^\\*:8080$|^\\[::\\]:8080$'; then
 echo 'FAILED: non-loopback admin bind, stopping Stalwart' >&2;systemctl stop "$unit";exit 5
fi
[[ $(systemctl is-enabled "$unit") == disabled ]] || { echo 'FAILED: unit unexpectedly enabled';systemctl disable --now "$unit";exit 5; }
code=$(curl -sS -m 6 -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/admin/ 2>/dev/null || :)
[[ "$code" == 200 || "$code" == 401 || "$code" == 302 ]] || { echo "FAILED: admin HTTP $code; Stalwart remains running for inspection";exit 6; }
printf 'PASS: Stalwart normal mode running, unit disabled, one private HTTP listener, no mail ports; /admin/=HTTP %s\n' "$code"
echo 'NEXT: inspect default Roles and authenticate persistent admin account. No email was sent.'
