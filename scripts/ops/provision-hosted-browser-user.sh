#!/usr/bin/env bash
set -euo pipefail

# Provision one isolated Hosted Browser workspace on an already bootstrapped
# FractaNode. It deliberately does not create browser or Google credentials.

usage() {
  cat <<'EOF'
Usage:
  provision-hosted-browser-user.sh --gmail EMAIL --display NUMBER \
    --kasm-password-file PATH --rfb-password-file PATH [--start-url URL] [--with-rfb] [--dry-run]

The Gmail local part supplies the stable workspace key. For example,
jeanhuguesrobert@gmail.com becomes the Unix account hosted-jeanhuguesrobert.
The supplied password files must already have been created privately with the
appropriate KasmVNC / x11vnc tooling; this script never accepts a password.
EOF
}

gmail=''
display=''
kasm_password_file=''
rfb_password_file=''
start_url='https://www.google.com/'
with_rfb=false
dry_run=false

while (($#)); do
  case "$1" in
    --gmail) gmail="${2:-}"; shift 2 ;;
    --display) display="${2:-}"; shift 2 ;;
    --kasm-password-file) kasm_password_file="${2:-}"; shift 2 ;;
    --rfb-password-file) rfb_password_file="${2:-}"; shift 2 ;;
    --start-url) start_url="${2:-}"; shift 2 ;;
    --with-rfb) with_rfb=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 64 ;;
  esac
done

if [[ -z "$gmail" || -z "$display" || -z "$kasm_password_file" || -z "$rfb_password_file" ]]; then
  usage >&2
  exit 64
fi

gmail="$(printf '%s' "$gmail" | tr '[:upper:]' '[:lower:]')"
if [[ ! "$gmail" =~ ^[a-z0-9][a-z0-9.]*@gmail\.com$ ]]; then
  echo "--gmail must be a canonical Gmail address without a plus alias" >&2
  exit 64
fi
if [[ ! "$display" =~ ^[1-9][0-9]?$ ]]; then
  echo "--display must be an integer from 1 to 99" >&2
  exit 64
fi
if [[ "$start_url" == *$'\n'* || "$start_url" == *$'\r'* || ! "$start_url" =~ ^https?:// ]]; then
  echo "--start-url must be a single http(s) URL" >&2
  exit 64
fi

workspace_key="${gmail%@gmail.com}"
workspace_key="${workspace_key//./}"
unix_user="hosted-${workspace_key}"
home_dir="/home/${unix_user}"
env_dir='/etc/operium/hosted-browser'
env_file="${env_dir}/${unix_user}.env"
rfb_port=$((5900 + display))

plan() { printf '[plan] %s\n' "$*"; }
run() {
  if "$dry_run"; then plan "$*"; else "$@"; fi
}

if ! "$dry_run" && [[ "$(id -u)" -ne 0 ]]; then
  echo "run as root (for example: sudo $0 ...)" >&2
  exit 77
fi
if ! "$dry_run" && { [[ ! -s "$kasm_password_file" ]] || [[ ! -s "$rfb_password_file" ]]; }; then
  echo "password files must exist, be non-empty, and remain private" >&2
  exit 66
fi

if [[ -f "$env_file" ]]; then
  existing_display="$(sed -n 's/^HOSTED_BROWSER_DISPLAY=//p' "$env_file" | head -n 1)"
  if [[ "$existing_display" != "$display" ]]; then
    echo "${unix_user} already exists with display :${existing_display:-unknown}" >&2
    exit 73
  fi
fi
if [[ -d "$env_dir" ]]; then
  for candidate in "$env_dir"/*.env; do
    [[ -e "$candidate" && "$candidate" != "$env_file" ]] || continue
    if grep -qx "HOSTED_BROWSER_DISPLAY=${display}" "$candidate"; then
      echo "display :${display} is already allocated" >&2
      exit 73
    fi
  done
fi

if "$dry_run"; then
  plan "create or reconcile Unix account ${unix_user}"
  plan "install isolated profile under ${home_dir}/.hosted-browser"
  plan "write ${env_file} with display :${display}, CDP :$((9222 + display)), RFB :${rfb_port}"
  plan "enable hosted-browser@${unix_user}.service"
  "$with_rfb" && plan "enable localhost-only hosted-browser-rfb@${unix_user}.service"
  exit 0
fi

for required in /opt/operium/bin/start-hosted-browser.sh /etc/systemd/system/hosted-browser@.service; do
  [[ -f "$required" ]] || { echo "missing Hosted Browser prerequisite: $required" >&2; exit 69; }
done
getent group kasmvnc-cert >/dev/null || { echo "missing kasmvnc-cert group" >&2; exit 69; }

if ! id "$unix_user" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$unix_user"
fi
usermod -aG kasmvnc-cert "$unix_user"

install -d -o root -g root -m 0755 "$env_dir"
install -d -o "$unix_user" -g "$unix_user" -m 0700 "${home_dir}/.hosted-browser" "${home_dir}/.vnc"
install -o "$unix_user" -g "$unix_user" -m 0600 "$kasm_password_file" "${home_dir}/.kasmpasswd"
install -o "$unix_user" -g "$unix_user" -m 0600 "$rfb_password_file" "${home_dir}/.vnc/passwd"

tmp_env="$(mktemp)"
trap 'rm -f "$tmp_env"' EXIT
printf 'HOSTED_BROWSER_DISPLAY=%s\nHOSTED_BROWSER_START_URL=%s\nHOSTED_BROWSER_RFB_PORT=%s\n' \
  "$display" "$start_url" "$rfb_port" > "$tmp_env"
install -o root -g root -m 0640 "$tmp_env" "$env_file"

systemctl daemon-reload
systemctl enable --now "hosted-browser@${unix_user}.service"
if "$with_rfb"; then
  [[ -f /etc/systemd/system/hosted-browser-rfb@.service ]] || { echo "missing RFB unit" >&2; exit 69; }
  systemctl enable --now "hosted-browser-rfb@${unix_user}.service"
fi

printf 'Provisioned %s for %s on display :%s. Google login remains a human step.\n' \
  "$unix_user" "$gmail" "$display"
