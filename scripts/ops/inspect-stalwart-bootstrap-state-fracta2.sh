#!/usr/bin/env bash
# Read-only Stalwart 1.1.0 bootstrap persistence diagnostic.
# Outputs only file presence, metadata and network listener state, never credentials/config contents.
set -Eeuo pipefail
[[ $(id -u) -eq 0 ]] || { echo 'Run with sudo (read-only)'; exit 2; }
config=/etc/stalwart/config.json
data=/var/lib/stalwart
printf 'SERVICE_ACTIVE=%s\n' "$(systemctl is-active stalwart.service || :)"
printf 'SERVICE_ENABLED=%s\n' "$(systemctl is-enabled stalwart.service || :)"
printf 'CONFIG_PRESENT='
if [[ -f "$config" ]]; then
  echo yes
  stat -c 'CONFIG_BYTES=%s CONFIG_MTIME=%y CONFIG_OWNER=%U:%G' "$config"
  if python3 - "$config" <<'PY'
import json,sys
with open(sys.argv[1], encoding='utf8') as f: obj=json.load(f)
print('CONFIG_JSON_VALID=yes')
print('CONFIG_TYPE='+str(obj.get('@type','unspecified')))
print('CONFIG_DATASTORE_PATH='+str(obj.get('path','unspecified')))
PY
  then :; else echo 'CONFIG_JSON_VALID=no'; fi
else echo no; fi
printf 'DATA_DIRECTORY_PRESENT='
if [[ -d "$data" ]]; then
 echo yes
 find "$data" -maxdepth 2 -type f -printf 'DATA_FILE %P %s bytes %TY-%Tm-%TdT%TH:%TM\n' | head -40
else echo no; fi
printf 'BOOTSTRAP_GUARD='
if test -f /etc/systemd/system/stalwart.service.d/10-private-bootstrap.conf; then echo present; else echo absent; fi
printf 'LISTENER_PORTS='; ss -ltnH | awk '{print $4}' | sed -nE 's/.*:([0-9]+)$/\1/p' | sort -nu | grep -E '^(25|443|465|587|8080|993)$' | paste -sd, - || :
# No stop/start/restart, no changes, no mail sends.
