#!/usr/bin/env bash
set -euo pipefail

# List Hosted Browser workspaces from env files. Never prints credential files.

usage() {
  cat <<'EOF'
Usage:
  list-hosted-browser-workspaces.sh [--env-dir DIR] [--json]

Reads /etc/operium/hosted-browser/*.env (or --env-dir). Prints Unix owner,
display, derived localhost ports, start URL, and systemd active state when
systemctl is available. Does not read .kasmpasswd or RFB password files.
EOF
}

env_dir="${OPERIUM_HOSTED_BROWSER_ENV_DIR:-/etc/operium/hosted-browser}"
as_json=false

while (($#)); do
  case "$1" in
    --env-dir) env_dir="${2:-}"; shift 2 ;;
    --json) as_json=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 64 ;;
  esac
done

if [[ -z "$env_dir" || "$env_dir" == *$'\n'* ]]; then
  echo "invalid --env-dir" >&2
  exit 64
fi

shopt -s nullglob
files=("$env_dir"/*.env)
if ((${#files[@]} == 0)); then
  if "$as_json"; then
    printf '{"schema":"operium.hosted-browser.list.v1","count":0,"workspaces":[]}\n'
  else
    echo "no hosted-browser env files in ${env_dir}"
  fi
  exit 0
fi

rows=()
for env_file in "${files[@]}"; do
  unix_user="$(basename "$env_file" .env)"
  display="$(sed -n 's/^HOSTED_BROWSER_DISPLAY=//p' "$env_file" | head -n 1)"
  start_url="$(sed -n 's/^HOSTED_BROWSER_START_URL=//p' "$env_file" | head -n 1)"
  rfb_port="$(sed -n 's/^HOSTED_BROWSER_RFB_PORT=//p' "$env_file" | head -n 1)"
  session="$(sed -n 's/^HOSTED_SESSION=//p' "$env_file" | head -n 1)"
  assurance="$(sed -n 's/^HOSTED_ASSURANCE=//p' "$env_file" | head -n 1)"
  websocket_port=""
  cdp_port=""
  if [[ "$display" =~ ^[0-9]+$ ]]; then
    websocket_port=$((8443 + display))
    cdp_port=$((9222 + display))
    [[ -n "$rfb_port" ]] || rfb_port=$((5900 + display))
  fi
  unit="hosted-browser@${unix_user}.service"
  active="unknown"
  if command -v systemctl >/dev/null 2>&1; then
    active="$(systemctl is-active "$unit" 2>/dev/null || true)"
    [[ -n "$active" ]] || active="unknown"
  fi
  rows+=("${unix_user}|${display}|${websocket_port}|${cdp_port}|${rfb_port}|${active}|${session:-kiosk}|${assurance:-lab-sesame}|${start_url}|${env_file}")
done

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

if "$as_json"; then
  printf '{"schema":"operium.hosted-browser.list.v1","count":%s,"workspaces":[' "${#rows[@]}"
  first=true
  for row in "${rows[@]}"; do
    IFS='|' read -r unix_user display websocket_port cdp_port rfb_port active session assurance start_url env_file <<<"$row"
    "$first" || printf ','
    first=false
    printf '{"unix_user":"%s","display":"%s","websocket_port":"%s","cdp_port":"%s","rfb_port":"%s","systemd_active":"%s","session":"%s","assurance":"%s","start_url":"%s","env_file":"%s"}' \
      "$(json_escape "$unix_user")" "$(json_escape "$display")" \
      "$(json_escape "$websocket_port")" "$(json_escape "$cdp_port")" \
      "$(json_escape "$rfb_port")" "$(json_escape "$active")" \
      "$(json_escape "$session")" "$(json_escape "$assurance")" \
      "$(json_escape "$start_url")" "$(json_escape "$env_file")"
  done
  printf ']}\n'
  exit 0
fi

printf '%-28s %-8s %-8s %-12s %-10s %-8s %-8s %-10s %s\n' \
  "UNIX_USER" "DISPLAY" "SESSION" "ASSURANCE" "KASM_HTTP" "CDP" "RFB" "UNIT" "START_URL"
for row in "${rows[@]}"; do
  IFS='|' read -r unix_user display websocket_port cdp_port rfb_port active session assurance start_url env_file <<<"$row"
  printf '%-28s %-8s %-8s %-12s %-10s %-8s %-8s %-10s %s\n' \
    "$unix_user" "${display:+:$display}" "$session" "$assurance" \
    "${websocket_port:-}" "${cdp_port:-}" "${rfb_port:-}" "$active" "${start_url:-}"
done
