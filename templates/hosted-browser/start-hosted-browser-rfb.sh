#!/usr/bin/env bash
set -euo pipefail

USER_ID="${1:?usage: start-hosted-browser-rfb.sh <user-id>}"
ENV_FILE="/etc/operium/hosted-browser/${USER_ID}.env"
HOME_DIR="/home/${USER_ID}"

if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

DISPLAY_NUM="${HOSTED_BROWSER_DISPLAY:-}"
RFB_PORT="${HOSTED_BROWSER_RFB_PORT:-$((5900 + DISPLAY_NUM))}"
PASSWD_FILE="${HOME_DIR}/.vnc/passwd"

if ! [[ "${DISPLAY_NUM}" =~ ^[0-9]+$ && "${RFB_PORT}" =~ ^[0-9]+$ ]]; then
  echo "[hosted-browser-rfb] numeric HOSTED_BROWSER_DISPLAY required" >&2
  exit 64
fi
if [ ! -s "${PASSWD_FILE}" ]; then
  echo "[hosted-browser-rfb] missing RFB password file: ${PASSWD_FILE}" >&2
  exit 78
fi

# SSH forwards from trusted viewers are the only ingress; do not publish RFB.
exec /usr/bin/x11vnc -display ":${DISPLAY_NUM}" -auth "${HOME_DIR}/.Xauthority" \
  -rfbauth "${PASSWD_FILE}" -rfbport "${RFB_PORT}" -localhost -forever -shared \
  -noxrecord -noxfixes -noxdamage
