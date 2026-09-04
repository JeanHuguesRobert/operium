#!/usr/bin/env bash
set -euo pipefail

# Mutate Hosted Workspace session policy in the env file (issue #49).
# Does not grant sudo, publish Caddy, or change KasmVNC passwords.

usage() {
  cat <<'EOF'
Usage:
  configure-hosted-browser-workspace.sh --unix NAME
    [--session kiosk|desktop] [--assurance lab-sesame|mesh-session|future-idp]
    [--bind public|mesh] [--waiver none|principal-lab]
    [--chrome-restart on-exit|off] [--cooldown SECONDS]
    [--restart] [--dry-run]

Writes /etc/operium/hosted-browser/<unix>.env after hosted-workspace-policy.sh
allows the pair. Default new values: kiosk, lab-sesame, public, no waiver.
EOF
}

here="$(cd "$(dirname "$0")" && pwd)"
policy="${here}/hosted-workspace-policy.sh"
env_dir="${OPERIUM_HOSTED_BROWSER_ENV_DIR:-/etc/operium/hosted-browser}"

unix_user=''
session=''
assurance=''
bind=''
waiver=''
chrome_restart=''
cooldown=''
do_restart=false
dry_run=false

while (($#)); do
  case "$1" in
    --unix) unix_user="${2:-}"; shift 2 ;;
    --session) session="${2:-}"; shift 2 ;;
    --assurance) assurance="${2:-}"; shift 2 ;;
    --bind) bind="${2:-}"; shift 2 ;;
    --waiver) waiver="${2:-}"; shift 2 ;;
    --chrome-restart) chrome_restart="${2:-}"; shift 2 ;;
    --cooldown) cooldown="${2:-}"; shift 2 ;;
    --restart) do_restart=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 64 ;;
  esac
done

if [[ -z "$unix_user" || ! "$unix_user" =~ ^hosted-[a-z0-9]+$ ]]; then
  echo "--unix must look like hosted-<key>" >&2
  exit 64
fi

env_file="${env_dir}/${unix_user}.env"

read_env() {
  local key="$1" default="$2"
  if [[ -f "$env_file" ]]; then
    local value
    value="$(sed -n "s/^${key}=//p" "$env_file" | head -n 1)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return
    fi
  fi
  printf '%s' "$default"
}

session="$(printf '%s' "${session:-$(read_env HOSTED_SESSION kiosk)}" | tr '[:upper:]' '[:lower:]')"
assurance="$(printf '%s' "${assurance:-$(read_env HOSTED_ASSURANCE lab-sesame)}" | tr '[:upper:]' '[:lower:]')"
bind="$(printf '%s' "${bind:-$(read_env HOSTED_BIND public)}" | tr '[:upper:]' '[:lower:]')"
waiver="$(printf '%s' "${waiver:-$(read_env HOSTED_ASSURANCE_WAIVER none)}" | tr '[:upper:]' '[:lower:]')"
chrome_restart="$(printf '%s' "${chrome_restart:-$(read_env HOSTED_CHROME_RESTART on-exit)}" | tr '[:upper:]' '[:lower:]')"
cooldown="$(printf '%s' "${cooldown:-$(read_env HOSTED_CHROME_COOLDOWN_SECONDS 5)}")"
[[ -z "$waiver" ]] && waiver='none'

if [[ "$chrome_restart" != on-exit && "$chrome_restart" != off ]]; then
  echo "--chrome-restart must be on-exit or off" >&2
  exit 64
fi
if [[ ! "$cooldown" =~ ^[0-9]+$ ]] || ((cooldown < 1 || cooldown > 300)); then
  echo "--cooldown must be 1..300 seconds" >&2
  exit 64
fi

if ! bash "$policy" check --session "$session" --assurance "$assurance" --bind "$bind" --waiver "$waiver" --host-admin never; then
  exit 75
fi

display="$(read_env HOSTED_BROWSER_DISPLAY 1)"
start_url="$(read_env HOSTED_BROWSER_START_URL https://www.google.com/)"
rfb_port="$(read_env HOSTED_BROWSER_RFB_PORT $((5900 + display)))"

plan() { printf '[plan] %s\n' "$*"; }

if "$dry_run"; then
  plan "write ${env_file} session=${session} assurance=${assurance} bind=${bind} waiver=${waiver} chrome_restart=${chrome_restart} cooldown=${cooldown}"
  "$do_restart" && plan "systemctl restart hosted-browser@${unix_user}.service"
  exit 0
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "run as root (for example: sudo $0 ...)" >&2
  exit 77
fi

install -d -o root -g root -m 0755 "$env_dir"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
cat > "$tmp" <<EOF
HOSTED_BROWSER_DISPLAY=${display}
HOSTED_BROWSER_START_URL=${start_url}
HOSTED_BROWSER_RFB_PORT=${rfb_port}
HOSTED_SESSION=${session}
HOSTED_ASSURANCE=${assurance}
HOSTED_BIND=${bind}
HOSTED_ASSURANCE_WAIVER=${waiver}
HOSTED_CHROME_RESTART=${chrome_restart}
HOSTED_CHROME_COOLDOWN_SECONDS=${cooldown}
EOF
install -o root -g root -m 0640 "$tmp" "$env_file"

if "$do_restart"; then
  systemctl restart "hosted-browser@${unix_user}.service"
fi

printf 'Configured %s: session=%s assurance=%s bind=%s waiver=%s\n' \
  "$unix_user" "$session" "$assurance" "$bind" "$waiver"
