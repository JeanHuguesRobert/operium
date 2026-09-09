#!/usr/bin/env bash
set -euo pipefail

# Move a legacy Hosted Browser Unix workspace onto the canonical Gmail key
# and/or rewrite its KasmVNC login to the lab sesame. Does not publish Caddy
# and does not sign into Google.

usage() {
  cat <<'EOF'
Usage:
  migrate-hosted-browser-user.sh --from-unix NAME --gmail EMAIL
    [--display N] [--password-only] [--test-local] [--dry-run]

--password-only   Rewrite ~/.kasmpasswd on the existing Unix account and
                  restart that unit. No home rename.
Default           Stop the legacy unit, rename Unix user/group/home to
                  hosted-<gmail-local-without-dots>, write lab sesame,
                  enable the new unit, leave the old unit disabled.

Lab Websockify login: user=<gmail-local> password=sesame-<gmail-local>
EOF
}

from_unix=''
gmail=''
display=''
password_only=false
test_local=false
dry_run=false

while (($#)); do
  case "$1" in
    --from-unix) from_unix="${2:-}"; shift 2 ;;
    --gmail) gmail="${2:-}"; shift 2 ;;
    --display) display="${2:-}"; shift 2 ;;
    --password-only) password_only=true; shift ;;
    --test-local) test_local=true; shift ;;
    --dry-run) dry_run=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 64 ;;
  esac
done

if [[ -z "$from_unix" || -z "$gmail" ]]; then
  usage >&2
  exit 64
fi

gmail="$(printf '%s' "$gmail" | tr '[:upper:]' '[:lower:]')"
if [[ ! "$gmail" =~ ^[a-z0-9][a-z0-9.]*@gmail\.com$ ]]; then
  echo "--gmail must be a canonical Gmail address without a plus alias" >&2
  exit 64
fi
if [[ ! "$from_unix" =~ ^hosted-[a-z0-9]+$ ]]; then
  echo "--from-unix must look like hosted-<key>" >&2
  exit 64
fi

gmail_local="${gmail%@gmail.com}"
workspace_key="${gmail_local//./}"
to_unix="hosted-${workspace_key}"
kasm_user="$gmail_local"
kasm_password="sesame-${gmail_local}"
from_home="/home/${from_unix}"
to_home="/home/${to_unix}"
env_dir='/etc/operium/hosted-browser'

plan() { printf '[plan] %s\n' "$*"; }

if [[ -n "$display" && ! "$display" =~ ^[1-9][0-9]?$ ]]; then
  echo "--display must be an integer from 1 to 99" >&2
  exit 64
fi

if ! "$dry_run" && [[ "$(id -u)" -ne 0 ]]; then
  echo "run as root (for example: sudo $0 ...)" >&2
  exit 77
fi

if ! "$dry_run"; then
  id "$from_unix" >/dev/null 2>&1 || { echo "missing Unix account ${from_unix}" >&2; exit 66; }
  [[ -d "$from_home" ]] || { echo "missing home ${from_home}" >&2; exit 66; }
fi

if [[ -z "$display" ]]; then
  env_guess="${env_dir}/${from_unix}.env"
  if [[ -f "$env_guess" ]]; then
    display="$(sed -n 's/^HOSTED_BROWSER_DISPLAY=//p' "$env_guess" | head -n 1)"
  fi
fi
[[ -n "$display" ]] || display=1
websocket_port=$((8443 + display))

if "$dry_run"; then
  plan "legacy Unix ${from_unix} -> canonical ${to_unix}"
  plan "KasmVNC HTTP Basic user=${kasm_user} password=sesame-${gmail_local} (lab sesame; not a security boundary)"
  if "$password_only"; then
    plan "rewrite ${from_home}/.kasmpasswd and restart hosted-browser@${from_unix}"
  else
    plan "stop hosted-browser@${from_unix}"
    plan "rename user/group/home to ${to_unix} / ${to_home}"
    plan "write ${env_dir}/${to_unix}.env display :${display}"
    plan "enable hosted-browser@${to_unix}; disable hosted-browser@${from_unix}"
  fi
  "$test_local" && plan "GET https://127.0.0.1:${websocket_port}/ with lab sesame (KasmVNC TLS)"
  exit 0
fi

write_lab_kasmpasswd() {
  local dest="$1"
  local owner="$2"
  local tool=""
  tool="$(command -v vncpasswd || true)"
  [[ -n "$tool" ]] || tool="$(command -v kasmvncpasswd || true)"
  [[ -n "$tool" ]] || { echo "vncpasswd or kasmvncpasswd is required" >&2; exit 69; }
  local tmp
  tmp="$(mktemp)"
  rm -f "$tmp"
  printf '%s\n%s\n' "$kasm_password" "$kasm_password" | "$tool" -u "$kasm_user" -w "$tmp"
  [[ -s "$tmp" ]] || { echo "${tool} produced an empty password file" >&2; rm -f "$tmp"; exit 70; }
  install -o "$owner" -g "$owner" -m 0600 "$tmp" "$dest"
  rm -f "$tmp"
}

test_local_auth() {
  local code
  local i=0
  while ((i < 20)); do
    if curl -sk --max-time 2 "https://127.0.0.1:${websocket_port}/" >/dev/null 2>&1 || \
       curl -sk --max-time 2 -o /dev/null "https://127.0.0.1:${websocket_port}/"; then
      break
    fi
    sleep 2
    i=$((i + 1))
  done
  code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 15 \
    -u "${kasm_user}:${kasm_password}" "https://127.0.0.1:${websocket_port}/" || true)"
  printf 'local Websockify HTTP %s for user %s on :%s\n' "$code" "$kasm_user" "$websocket_port"
  [[ "$code" == "200" || "$code" == "302" ]] || {
    echo "local sesame test failed (want 200/302, got ${code})" >&2
    exit 75
  }
}

if "$password_only"; then
  if [[ -f "${from_home}/.kasmpasswd" ]]; then
    install -o "$from_unix" -g "$from_unix" -m 0600 \
      "${from_home}/.kasmpasswd" "${from_home}/.kasmpasswd.bak-pre-sesame"
  fi
  write_lab_kasmpasswd "${from_home}/.kasmpasswd" "$from_unix"
  systemctl restart "hosted-browser@${from_unix}.service"
  sleep 2
  systemctl is-active --quiet "hosted-browser@${from_unix}.service"
  "$test_local" && test_local_auth
  printf 'Updated lab sesame on %s (Unix name unchanged). Rollback file: %s\n' \
    "$from_unix" "${from_home}/.kasmpasswd.bak-pre-sesame"
  exit 0
fi

if [[ "$from_unix" == "$to_unix" ]]; then
  echo "canonical Unix name already ${to_unix}; use --password-only to rewrite sesame" >&2
  exit 64
fi
if id "$to_unix" >/dev/null 2>&1; then
  echo "target Unix account ${to_unix} already exists" >&2
  exit 73
fi
if [[ -e "$to_home" ]]; then
  echo "target home ${to_home} already exists" >&2
  exit 73
fi

systemctl stop "hosted-browser@${from_unix}.service"
sleep 1

if [[ -f "${from_home}/.kasmpasswd" ]]; then
  install -o "$from_unix" -g "$from_unix" -m 0600 \
    "${from_home}/.kasmpasswd" "${from_home}/.kasmpasswd.bak-pre-sesame"
fi
write_lab_kasmpasswd "${from_home}/.kasmpasswd" "$from_unix"

groupmod -n "$to_unix" "$from_unix"
usermod -l "$to_unix" -d "$to_home" -m "$from_unix"

install -d -o root -g root -m 0755 "$env_dir"
tmp_env="$(mktemp)"
trap 'rm -f "$tmp_env"' EXIT
printf 'HOSTED_BROWSER_DISPLAY=%s\nHOSTED_BROWSER_START_URL=%s\nHOSTED_BROWSER_RFB_PORT=%s\n' \
  "$display" "${HOSTED_BROWSER_START_URL:-https://chatgpt.com}" "$((5900 + display))" > "$tmp_env"
install -o root -g root -m 0640 "$tmp_env" "${env_dir}/${to_unix}.env"

systemctl daemon-reload
systemctl disable "hosted-browser@${from_unix}.service" || true
systemctl enable --now "hosted-browser@${to_unix}.service"
sleep 2
systemctl is-active --quiet "hosted-browser@${to_unix}.service"
"$test_local" && test_local_auth
printf 'Migrated %s -> %s on display :%s. Old unit disabled; Chrome profile moved with the home directory.\n' \
  "$from_unix" "$to_unix" "$display"
