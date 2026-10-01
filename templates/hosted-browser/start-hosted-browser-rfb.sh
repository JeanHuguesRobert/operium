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
# KasmVNC's Xvnc already binds RFB at 5900+display. x11vnc must not steal that
# port or disable XDAMAGE/XFIXES — both freeze the Kasm websocket view.
RFB_PORT="${HOSTED_BROWSER_RFB_PORT:-$((5910 + DISPLAY_NUM))}"
PASSWD_FILE="${HOME_DIR}/.vnc/passwd"
RFB_LISTEN="${HOSTED_BROWSER_RFB_LISTEN:-127.0.0.1}"

if ! [[ "${DISPLAY_NUM}" =~ ^[0-9]+$ && "${RFB_PORT}" =~ ^[0-9]+$ ]]; then
  echo "[hosted-browser-rfb] numeric HOSTED_BROWSER_DISPLAY required" >&2
  exit 64
fi
if [ ! -s "${PASSWD_FILE}" ]; then
  echo "[hosted-browser-rfb] missing RFB password file: ${PASSWD_FILE}" >&2
  exit 78
fi
kasm_rfb=$((5900 + DISPLAY_NUM))
if [[ "${RFB_PORT}" -eq "${kasm_rfb}" ]]; then
  echo "[hosted-browser-rfb] port ${RFB_PORT} is KasmVNC native RFB; set HOSTED_BROWSER_RFB_PORT to e.g. $((5910 + DISPLAY_NUM))" >&2
  exit 64
fi

# Keep XDAMAGE/XFIXES enabled so KasmVNC can still capture the same display.
# Default listen is loopback; Tailscale mesh may set HOSTED_BROWSER_RFB_LISTEN.
exec /usr/bin/x11vnc -display ":${DISPLAY_NUM}" -auth "${HOME_DIR}/.Xauthority" \
  -rfbauth "${PASSWD_FILE}" -rfbport "${RFB_PORT}" -listen "${RFB_LISTEN}" \
  -forever -shared -noxrecord
