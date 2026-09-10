#!/usr/bin/env bash
# Recover a hosted-browser unit whose KasmVNC HTTPS listener disappeared while
# systemd still considers the process active. This is deliberately local-only:
# the public Caddy route and its credentials are not probed or logged here.
set -euo pipefail

user_id="${1:?usage: check-hosted-browser-health.sh <user-id>}"
env_file="/etc/operium/hosted-browser/${user_id}.env"
unit="hosted-browser@${user_id}.service"

if [[ -r "${env_file}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${env_file}"
  set +a
fi

display="${HOSTED_BROWSER_DISPLAY:-1}"
if ! [[ "${display}" =~ ^[0-9]+$ ]]; then
  logger -t hosted-browser-health -- "user=${user_id} result=invalid_display value=${display}"
  exit 64
fi

port=$((8443 + display))
code="000"
if systemctl is-active --quiet "${unit}"; then
  code="$(curl --insecure --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --connect-timeout 3 --max-time 8 "https://127.0.0.1:${port}/" 2>/dev/null || true)"
fi

# KasmVNC normally challenges unauthenticated local requests. A challenge is a
# healthy listener; any other result means Caddy would otherwise return 502.
case "${code}" in
  200|401|403)
    exit 0
    ;;
esac

logger -t hosted-browser-health -- "user=${user_id} result=restart unit=${unit} port=${port} http_code=${code}"
systemctl restart "${unit}"
