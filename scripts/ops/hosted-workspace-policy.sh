#!/usr/bin/env bash
set -euo pipefail

# Fail-closed Hosted Workspace capacity gate (issue #49).
# Capacities are implemented in the launcher; this script only says whether
# a requested (session, assurance, bind, waiver) pair is allowed.

usage() {
  cat <<'EOF'
Usage:
  hosted-workspace-policy.sh check --session kiosk|desktop \
    --assurance lab-sesame|mesh-session|future-idp \
    [--bind public|mesh] [--waiver none|principal-lab] [--host-admin never|request]

Exit 0 if allowed, 75 if refused. Prints a one-line reason.
EOF
}

session=''
assurance=''
bind='public'
waiver='none'
host_admin='never'

while (($#)); do
  case "$1" in
    check) shift ;;
    --session) session="${2:-}"; shift 2 ;;
    --assurance) assurance="${2:-}"; shift 2 ;;
    --bind) bind="${2:-}"; shift 2 ;;
    --waiver) waiver="${2:-}"; shift 2 ;;
    --host-admin) host_admin="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 64 ;;
  esac
done

session="$(printf '%s' "$session" | tr '[:upper:]' '[:lower:]')"
assurance="$(printf '%s' "$assurance" | tr '[:upper:]' '[:lower:]')"
bind="$(printf '%s' "$bind" | tr '[:upper:]' '[:lower:]')"
waiver="$(printf '%s' "$waiver" | tr '[:upper:]' '[:lower:]')"
host_admin="$(printf '%s' "$host_admin" | tr '[:upper:]' '[:lower:]')"
[[ -z "$waiver" ]] && waiver='none'
[[ -z "$bind" ]] && bind='public'
[[ -z "$host_admin" ]] && host_admin='never'

if [[ "$session" != kiosk && "$session" != desktop ]]; then
  echo "invalid session (want kiosk|desktop)" >&2
  exit 64
fi
if [[ "$assurance" != lab-sesame && "$assurance" != mesh-session && "$assurance" != future-idp ]]; then
  echo "invalid assurance (want lab-sesame|mesh-session|future-idp)" >&2
  exit 64
fi
if [[ "$bind" != public && "$bind" != mesh ]]; then
  echo "invalid bind (want public|mesh)" >&2
  exit 64
fi
if [[ "$waiver" != none && "$waiver" != principal-lab ]]; then
  echo "invalid waiver (want none|principal-lab)" >&2
  exit 64
fi

if [[ "$host_admin" != never ]]; then
  echo "refuse: host admin is not a Hosted Workspace capacity (use SSH as ubuntu)"
  exit 75
fi

if [[ "$session" == kiosk ]]; then
  echo "allow: kiosk is open at every assurance level"
  exit 0
fi

# session=desktop
if [[ "$assurance" == future-idp ]]; then
  echo "allow: desktop opened by future-idp"
  exit 0
fi
if [[ "$assurance" == mesh-session && "$bind" == mesh ]]; then
  echo "allow: desktop on mesh-session mesh bind"
  exit 0
fi
if [[ "$assurance" == lab-sesame && "$bind" == mesh ]]; then
  echo "allow: desktop on lab-sesame mesh bind (not public)"
  exit 0
fi
if [[ "$assurance" == lab-sesame && "$bind" == public && "$waiver" == principal-lab ]]; then
  echo "allow: desktop on lab-sesame public bind with principal-lab waiver"
  exit 0
fi

echo "refuse: desktop requires future-idp, mesh bind, or principal-lab waiver on public lab-sesame"
exit 75
