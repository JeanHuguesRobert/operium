#!/usr/bin/env bash
# Read-only local evidence for Oracle VPS recovery readiness. No secrets/OCIDs.
set -u
pass=0; warn=0
ok(){ printf 'PASS | %s\n' "$*"; pass=$((pass+1)); }
flag(){ printf 'CHECK | %s\n' "$*"; warn=$((warn+1)); }
echo 'Oracle recovery readiness — local evidence only'
if [ -r /etc/os-release ]; then . /etc/os-release; printf 'OS | %s | %s\n' "${PRETTY_NAME:-unknown}" "$(uname -m)"; fi
if snap list oracle-cloud-agent >/dev/null 2>&1; then
  ok "Oracle Cloud Agent installed"
  snap list oracle-cloud-agent | tail -1 | awk '{print "AGENT_VERSION | "$2}'
  if systemctl is-active --quiet snap.oracle-cloud-agent.oracle-cloud-agent.service; then
    ok 'Oracle Cloud Agent service active'
  else flag 'Oracle Cloud Agent service is not active'; fi
else flag 'Oracle Cloud Agent snap not detected'; fi
if systemctl is-active --quiet snap.oracle-cloud-agent.oracle-cloud-agent-updater.service; then
  ok 'Oracle Cloud Agent updater active'
else flag 'Oracle Cloud Agent updater inactive'; fi
serial=ttyS0
case "$(uname -m)" in aarch64|arm64) serial=ttyAMA0;; esac
if [ -c "/dev/$serial" ]; then ok "Serial character device /dev/$serial exists"; else flag "Missing /dev/$serial"; fi
if grep -Eq "(^|[[:space:]])console=$serial([[:space:],]|$)" /proc/cmdline; then
  ok "Current kernel command line enables $serial"
else flag "Current kernel command line does not mention console=$serial"; fi
if systemctl is-active --quiet "serial-getty@$serial.service"; then
  ok "Serial login getty running on $serial"
else flag "Serial login getty not active on $serial"; fi
if systemctl is-enabled --quiet "serial-getty@$serial.service"; then
  ok "Serial getty has an enablement mechanism (check runtime vs persistent)"
else flag "Serial getty lacks enablement; verify systemd-getty-generator"; fi
printf 'GETTY_ENABLEMENT | %s\n' "$(systemctl is-enabled "serial-getty@$serial.service" 2>/dev/null || true)"
logfile=/var/log/oracle-cloud-agent/agent.log
if [ -r "$logfile" ]; then
  for entry in 'runcommand:Compute Instance Run Command' 'gomon:Compute Instance Monitoring' 'oci-osmh:OS Management Hub'; do
    key=${entry%%:*}; name=${entry#*:}
    line=$(grep -F "health check of plugin:[$key]" "$logfile" | tail -1)
    if [ -z "$line" ]; then flag "$name: no recent plugin status evidence"; continue; fi
    desired=$(printf '%s' "$line" | sed -n 's/.*desiredState:\[\([^]]*\)\].*/\1/p')
    current=$(printf '%s' "$line" | sed -n 's/.*currentState:\[\([^]]*\)\].*/\1/p')
    printf 'PLUGIN | %s | desired=%s | observed=%s\n' "$name" "$desired" "$current"
    if [ "$key" = oci-osmh ]; then
      printf 'OPTIONAL | OS Management Hub: not required for break-glass recovery
'
    elif [ "$current" = running ]; then ok "$name agent-side running (OCI execution not proven)"
    else flag "$name agent-side not running"; fi
  done
else flag 'Oracle Cloud Agent log inaccessible'; fi
printf 'SUMMARY | %d local checks passed; %d warnings/review items\n' "$pass" "$warn"
printf 'EXTERNAL_VERIFICATION_REQUIRED | OCI Cloud Shell serial connection, interactive login/recovery, Run Command, IAM, monitoring visibility\n'
