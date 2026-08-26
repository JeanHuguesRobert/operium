#!/usr/bin/env bash
set -euo pipefail

# start-hosted-browser.sh
# Minimal, robust launcher for KasmVNC + Chromium with native CDP endpoint.
# Usage: start-hosted-browser.sh <user-id> [display_num]

USER_ID="${1:-hosted-user}"
DISPLAY_NUM="${2:-1}"
VNC_PORT=$(( 8443 + DISPLAY_NUM ))
CDP_PORT=$(( 9222 + DISPLAY_NUM ))
USER_DATA_DIR="/home/${USER_ID}/.hosted-browser/chromium-profile"

mkdir -p "${USER_DATA_DIR}"
chmod 700 "/home/${USER_ID}/.hosted-browser"

echo "[hosted-browser] Starting KasmVNC on display :${DISPLAY_NUM} (port ${VNC_PORT})..."
vncserver ":${DISPLAY_NUM}" \
  -geometry 1920x1080 \
  -depth 24 \
  -websocketPort "${VNC_PORT}" \
  -httpDir /usr/share/kasmvnc/www \
  -interface 127.0.0.1 \
  -SecurityTypes None

export DISPLAY=":${DISPLAY_NUM}"

echo "[hosted-browser] Launching Chromium with private profile & CDP on 127.0.0.1:${CDP_PORT}..."
exec /usr/bin/chromium-browser \
  --user-data-dir="${USER_DATA_DIR}" \
  --no-first-run \
  --no-default-browser-check \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port="${CDP_PORT}" \
  --disable-dev-shm-usage \
  --disable-gpu \
  --window-size=1920,1080 \
  --window-position=0,0 \
  "https://chatgpt.com"
