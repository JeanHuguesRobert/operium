#!/usr/bin/env bash
set -euo pipefail

# start-hosted-browser.sh
# Minimal, robust launcher for KasmVNC + Chromium/Chrome with native CDP endpoint.
# Usage: start-hosted-browser.sh <user-id> [display_num]

USER_ID="${1:-hosted-user}"
DISPLAY_NUM="${2:-${HOSTED_BROWSER_DISPLAY:-1}}"
VNC_PORT=$(( 8443 + DISPLAY_NUM ))
CDP_PORT=$(( 9222 + DISPLAY_NUM ))
HOME_DIR="/home/${USER_ID}"
USER_DATA_DIR="${HOME_DIR}/.hosted-browser/chromium-profile"
PASSWD_FILE="${HOME_DIR}/.kasmpasswd"
START_URL="${HOSTED_BROWSER_START_URL:-https://chatgpt.com}"

if ! [[ "${DISPLAY_NUM}" =~ ^[0-9]+$ ]]; then
  echo "[hosted-browser] HOSTED_BROWSER_DISPLAY must be numeric" >&2
  exit 64
fi

mkdir -p "${USER_DATA_DIR}" "${HOME_DIR}/.vnc"
chmod 700 "${HOME_DIR}/.hosted-browser"

# Initialize non-interactive KasmVNC password file if missing
if [ ! -f "${PASSWD_FILE}" ]; then
  echo -e "hosted123\nhosted123\n" | kasmvncpasswd -u "${USER_ID}" -wo "${PASSWD_FILE}"
  chmod 600 "${PASSWD_FILE}"
fi

# Bypass KasmVNC desktop environment prompt
touch "${HOME_DIR}/.vnc/.de-was-selected"

# Determine browser binary
BROWSER_BIN="/usr/bin/google-chrome"
if [ ! -x "${BROWSER_BIN}" ]; then
  BROWSER_BIN="/usr/bin/chromium-browser"
fi

# Create xstartup script for this session
cat << EOF > "${HOME_DIR}/.vnc/xstartup"
#!/bin/sh
xrdb \$HOME/.Xresources 2>/dev/null || true
openbox &
exec "${BROWSER_BIN}" \
  --user-data-dir="${USER_DATA_DIR}" \
  --no-first-run \
  --no-default-browser-check \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=${CDP_PORT} \
  --disable-dev-shm-usage \
  --disable-gpu \
  --window-size=1920,1080 \
  --window-position=0,0 \
  "${START_URL}"
EOF
chmod +x "${HOME_DIR}/.vnc/xstartup"

echo "[hosted-browser] Killing any existing display :${DISPLAY_NUM}..."
/usr/bin/vncserver -kill ":${DISPLAY_NUM}" 2>/dev/null || true

echo "[hosted-browser] Starting KasmVNC on display :${DISPLAY_NUM} (HTTP/WS port ${VNC_PORT}, CDP port ${CDP_PORT})..."
exec /usr/bin/vncserver -fg ":${DISPLAY_NUM}" \
  -geometry 1920x1080 \
  -depth 24 \
  -websocketPort "${VNC_PORT}" \
  -interface 127.0.0.1 \
  -PasswordFile "${PASSWD_FILE}"
