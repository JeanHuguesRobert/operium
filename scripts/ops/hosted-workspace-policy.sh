#!/usr/bin/env bash
# Operium #49: advisory, fail-closed policy. Caller labels never authenticate.
set -euo pipefail
usage() { echo 'Usage: hosted-workspace-policy.sh check --session kiosk|desktop --assurance lab-sesame|mesh-session|future-idp [--bind public|mesh] [--host-admin never|request] [--waiver none|principal-lab]'; }
[[ "${1:-}" == check ]] || { usage >&2; exit 64; }
shift
session='' assurance='' bind='public' host_admin='never' waiver='none'
while (($#)); do
  case "$1" in
    --session|--assurance|--bind|--host-admin|--waiver)
      [[ $# -ge 2 ]] || { usage >&2; exit 64; }
      case "$1" in
        --session) session="$2";;
        --assurance) assurance="$2";;
        --bind) bind="$2";;
        --host-admin) host_admin="$2";;
        --waiver) waiver="$2";;
      esac
      shift 2;;
    -h|--help) usage; exit 0;;
    *) usage >&2; exit 64;;
  esac
done
[[ "$session" == kiosk || "$session" == desktop ]] || { echo 'invalid session' >&2; exit 64; }
[[ "$assurance" == lab-sesame || "$assurance" == mesh-session || "$assurance" == future-idp ]] || { echo 'invalid assurance' >&2; exit 64; }
[[ "$bind" == public || "$bind" == mesh ]] || { echo 'invalid bind' >&2; exit 64; }
[[ "$host_admin" == never || "$host_admin" == request ]] || { echo 'invalid host-admin' >&2; exit 64; }
[[ "$waiver" == none || "$waiver" == principal-lab ]] || { echo 'invalid waiver' >&2; exit 64; }
if [[ "$host_admin" != never ]]; then
  echo 'deny: host administration is never a hosted-browser capacity'
  exit 75
fi
if [[ "$session" == kiosk ]]; then
  echo 'allow-advisory: kiosk; authentication and network controls must be checked independently'
  exit 0
fi
echo 'deny: desktop requires independently verified assurance, network scope and Principal authorization; caller labels are insufficient'
exit 75
