#!/usr/bin/env bash
# Operium/OCI provisioning: idempotently ensure a serial console connection exists.
# Read-only by default; --apply authorizes creation (not guest account configuration).
set -euo pipefail
usage() { echo "Usage: $0 --instance-id OCID --ssh-public-key-file PATH [--apply] [--profile OCI_PROFILE]"; }
instance_id=''; public_key=''; profile=''; apply=0
while (($#)); do
  case "$1" in
    --instance-id) instance_id="${2:?}"; shift 2;;
    --ssh-public-key-file) public_key="${2:?}"; shift 2;;
    --profile) profile="${2:?}"; shift 2;;
    --apply) apply=1; shift;;
    -h|--help) usage; exit 0;;
    *) usage >&2; exit 2;;
  esac
done
[[ "$instance_id" == ocid1.instance.* ]] || { echo "ERROR: valid --instance-id required" >&2; exit 2; }
[[ -f "$public_key" && -r "$public_key" ]] || { echo "ERROR: readable SSH public key required" >&2; exit 2; }
command -v oci >/dev/null || { echo "ERROR: OCI CLI unavailable (run on OCI-authenticated control workstation/Cloud Shell)" >&2; exit 3; }
command -v jq >/dev/null || { echo "ERROR: jq unavailable" >&2; exit 3; }
oci_args=()
[[ -z "$profile" ]] || oci_args+=(--profile "$profile")
compartment=$(oci compute instance get --instance-id "$instance_id" "${oci_args[@]}" --output json | jq -er '.data."compartment-id"')
connections=$(oci compute instance-console-connection list --compartment-id "$compartment" --instance-id "$instance_id" --all "${oci_args[@]}" --output json)
existing=$(jq -r --arg id "$instance_id" '[.data[] | select(."instance-id"==$id and (."lifecycle-state"=="ACTIVE" or ."lifecycle-state"=="CREATING"))] | length' <<<"$connections")
if (( existing > 0 )); then
  printf 'RESULT | console_connection=present count=%s instance=%s\n' "$existing" "$instance_id"
  echo 'NEXT | Verify an actual interactive serial login and sudo/recovery; connection existence is not proof.'
  exit 0
fi
if (( ! apply )); then
  printf 'PLAN | create OCI console connection for instance=%s using key_file=%s\n' "$instance_id" "$public_key"
  echo 'NEXT | Re-run with --apply for OCI-side creation; interactive guest recovery must be tested separately.'
  exit 0
fi
created=$(oci compute instance-console-connection create --instance-id "$instance_id" --ssh-public-key-file "$public_key" "${oci_args[@]}" --output json)
id=$(jq -er '.data.id' <<<"$created")
state=$(jq -r '.data."lifecycle-state" // "UNKNOWN"' <<<"$created")
printf 'RESULT | console_connection=created lifecycle=%s id=%s\n' "$state" "$id"
echo 'NEXT | Verify ACTIVE state, actual serial-console access, guest recovery login and sudo. Do not claim readiness from creation alone.'
