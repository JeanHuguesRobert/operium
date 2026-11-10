#!/usr/bin/env bash
# One-time owner maintenance of the already installed private MCP service.
# Grants Cogentia's existing service account read access to the single
# Stalwart credential file, then starts the private JMAP/COP integration.
# No credentials printed/copied, no mail sent, no backups or new listeners.
set -Eeuo pipefail
[[ $(id -u) == 0 && $# == 1 && "${1:-}" == --apply ]] || {
  echo 'Usage: sudo bash enable-agent-mail-cogentia-fracta2.sh --apply';exit 2;
}
repo=/srv/cogentia/repos/cogentia
cred=/etc/stalwart/jhn-agent-mailboxes.json
dropin=/etc/systemd/system/mcp-cogentia.service.d/90-agent-mail.conf
[[ -s "$cred" && -d /etc/stalwart ]] || { echo 'FAIL: Stalwart credential file unavailable'; exit 3; }
[[ $(systemctl is-active stalwart.service) == active ]] || { echo 'FAIL: Stalwart inactive';exit 3; }
[[ $(systemctl is-active mcp-cogentia.service) == active ]] || { echo 'FAIL: MCP inactive';exit 3; }
[[ $(systemctl show mcp-cogentia.service -p User --value) == ubuntu ]] || { echo 'FAIL: unexpected MCP OS user';exit 3; }
[[ $(stat -c %U "$cred") == root ]] || { echo 'FAIL: unexpected Stalwart credential owner';exit 3; }
[[ $(stat -c %U /etc/stalwart) == stalwart ]] || { echo 'FAIL: unexpected Stalwart config owner';exit 3; }
[[ $(stat -c %a "$cred") =~ ^(600|640)$ ]] || { echo 'FAIL: unexpected file permissions';exit 3; }
node --version >/dev/null 2>&1 || :
/usr/local/node-v26.5.0/bin/node --check "$repo/scripts/lib/agent-mail-runtime.js"
/usr/local/node-v26.5.0/bin/node --check "$repo/scripts/cogentia-mcp-http.js"
# Access to directory names only; other config files retain their modes.
chgrp ubuntu /etc/stalwart
chmod 750 /etc/stalwart
chgrp ubuntu "$cred"
chmod 640 "$cred"
# The runtime uses the existing canonical Inseme store and trusted issuer key;
# a missing mail mandate still refuses both mail operations.
install -d -m 755 /etc/systemd/system/mcp-cogentia.service.d
printf '[Service]\nEnvironment=COGENTIA_AGENT_MAIL_RUNTIME=1\n' > "$dropin"
chmod 644 "$dropin"
systemctl daemon-reload
systemctl restart mcp-cogentia.service
sleep 1
if [[ $(systemctl is-active mcp-cogentia.service) != active ]];then
 echo 'FAIL: MCP did not restart; journalctl -u mcp-cogentia -n 30' >&2;exit 5
fi
# Verify no mail ports gained exposure and Stalwart remains loopback HTTP.
python3 - <<'PYPORT'
import subprocess
admin=[]
for row in subprocess.check_output(['ss','-ltnH'],text=True).splitlines():
 p=row.split()
 if len(p)<4:continue
 local=p[3]
 try:port=int(local.rsplit(':',1)[1])
 except (IndexError,ValueError):continue
 if port in {25,465,587,993,995,2525,4190}:raise SystemExit('FAIL: unexpected mail protocol port')
 if port==8080:admin.append(local)
assert admin==['127.0.0.1:8080'], 'FAIL: Stalwart no longer private: '+repr(admin)
PYPORT
# Query the actual restarted local MCP catalogue. The tool is announced,
# but only COP + authenticated broker may execute send or receive.
python3 - <<'PYAPI'
import urllib.request,json
req=urllib.request.Request('http://127.0.0.1:8791/mcp',data=json.dumps({
 'jsonrpc':'2.0','id':1,'method':'tools/call',
 'params':{'name':'cogentia_cli_catalog','arguments':{}}
}).encode(),headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},method='POST')
with urllib.request.urlopen(req,timeout=12) as res: raw=res.read().decode()
if raw.startswith('event:') or raw.startswith('data:'):
 raw=''.join(line[5:].strip() for line in raw.splitlines() if line.startswith('data:'))
reply=json.loads(raw)
body=json.dumps(reply)
assert 'cogentia_agent_mail_send' in body and 'cogentia_agent_mail_receive' in body, 'FAIL: MCP catalog did not reload mail tools'
print('PASS: live MCP catalogue includes agent_mail_send and agent_mail_receive')
PYAPI
printf '%s\n' 'PASS: private JMAP runtime bound, service active, no mail listeners; COP permission unchanged; no message sent'
# Owner is activating a protected *exact* internal-mail mandate extension,
# never a generic mandate-issuance endpoint. The decision is verified by live
# Supabase authentication; the issuer applies only that precise mail scope.
python3 "$repo/scripts/ops/consent-deploy/enable-jhn-consent-decisions.py" --apply
consentOverride=/etc/systemd/system/cogentia-jhn-consent.service.d/60-agent-mail-exact-apply.conf
printf '[Service]\nEnvironment=COGENTIA_JHN_CONSENT_ENABLE_AGENT_MAIL_APPLY=1\n' > "$consentOverride"
chmod 644 "$consentOverride"
systemctl daemon-reload
systemctl restart cogentia-jhn-consent.service
[[ $(systemctl is-active cogentia-jhn-consent.service) == active ]] || { echo 'FAIL: consent service inactive'; exit 6; }
[[ $(systemctl show cogentia-jhn-consent.service -p Environment --value) == *COGENTIA_JHN_CONSENT_ENABLE_AGENT_MAIL_APPLY=1* ]] || { echo 'FAIL: exact consent apply not activated'; exit 6; }
# A pending challenge is not a grant. The owner must still explicitly approve
# in their independently authenticated browser. The challenge expires after
# ten minutes; the --request command can be reissued without restart.
runuser -u ubuntu -- env SSH_CONNECTION=owner-invoked-bootstrap \
  /usr/local/node-v26.5.0/bin/node "$repo/scripts/ops/jhn-agent-mail-consent-cli.js" --request
