#!/usr/bin/env bash
set -euo pipefail

# start-hosted-browser.sh
# KasmVNC + Chrome. Session mode comes from the workspace env (issue #49):
#   HOSTED_SESSION=kiosk|desktop
# Chrome is never the X session process (no exec), so kiosk can restart it
# and desktop can keep Openbox when Chrome exits.

USER_ID="${1:-hosted-user}"
DISPLAY_NUM="${2:-${HOSTED_BROWSER_DISPLAY:-1}}"
VNC_PORT=$(( 8443 + DISPLAY_NUM ))
CDP_PORT=$(( 9222 + DISPLAY_NUM ))
HOME_DIR="/home/${USER_ID}"
USER_DATA_DIR="${HOME_DIR}/.hosted-browser/chromium-profile"
PASSWD_FILE="${HOME_DIR}/.kasmpasswd"
START_URL="${HOSTED_BROWSER_START_URL:-https://chatgpt.com}"
SESSION_MODE="$(printf '%s' "${HOSTED_SESSION:-kiosk}" | tr '[:upper:]' '[:lower:]')"
CHROME_RESTART="$(printf '%s' "${HOSTED_CHROME_RESTART:-on-exit}" | tr '[:upper:]' '[:lower:]')"
COOLDOWN="${HOSTED_CHROME_COOLDOWN_SECONDS:-5}"
TEMPLATE_DIR="${HOSTED_BROWSER_TEMPLATE_DIR:-/opt/operium/templates/hosted-browser}"

if ! [[ "${DISPLAY_NUM}" =~ ^[0-9]+$ ]]; then
  echo "[hosted-browser] HOSTED_BROWSER_DISPLAY must be numeric" >&2
  exit 64
fi
if [[ "${SESSION_MODE}" != kiosk && "${SESSION_MODE}" != desktop ]]; then
  echo "[hosted-browser] HOSTED_SESSION must be kiosk or desktop" >&2
  exit 64
fi
if ! [[ "${COOLDOWN}" =~ ^[0-9]+$ ]]; then
  COOLDOWN=5
fi

mkdir -p "${USER_DATA_DIR}" "${HOME_DIR}/.vnc" "${HOME_DIR}/.config/openbox" "${HOME_DIR}/.hosted-browser"
chmod 700 "${HOME_DIR}/.hosted-browser"

if [ ! -f "${PASSWD_FILE}" ]; then
  echo "[hosted-browser] missing VNC password file: ${PASSWD_FILE}" >&2
  exit 78
fi
chmod 600 "${PASSWD_FILE}"

touch "${HOME_DIR}/.vnc/.de-was-selected"

BROWSER_BIN="/usr/bin/google-chrome"
if [ ! -x "${BROWSER_BIN}" ]; then
  BROWSER_BIN="/usr/bin/chromium-browser"
fi

TERMINAL_BIN="xterm"
for candidate in x-terminal-emulator xterm xfce4-terminal lxterminal; do
  if command -v "$candidate" >/dev/null 2>&1; then
    TERMINAL_BIN="$(command -v "$candidate")"
    break
  fi
done

cat > "${HOME_DIR}/.hosted-browser/run-chrome.sh" <<EOF
#!/bin/sh
exec "${BROWSER_BIN}" \\
  --user-data-dir="${USER_DATA_DIR}" \\
  --no-first-run \\
  --no-default-browser-check \\
  --remote-debugging-address=127.0.0.1 \\
  --remote-debugging-port=${CDP_PORT} \\
  --disable-dev-shm-usage \\
  --disable-gpu \\
  --window-size=1920,1080 \\
  --window-position=0,0 \\
  "${START_URL}"
EOF
chmod +x "${HOME_DIR}/.hosted-browser/run-chrome.sh"

cat > "${HOME_DIR}/.hosted-browser/restart-chrome.sh" <<EOF
#!/bin/sh
pkill -f -- "--user-data-dir=${USER_DATA_DIR}" 2>/dev/null || true
sleep 1
exec "${HOME_DIR}/.hosted-browser/run-chrome.sh"
EOF
chmod +x "${HOME_DIR}/.hosted-browser/restart-chrome.sh"

install_openbox_file() {
  local src_name="$1" dest="$2"
  local src="${TEMPLATE_DIR}/${src_name}"
  if [[ -f "$src" ]]; then
    sed -e "s|HOME_DIR|${HOME_DIR}|g" -e "s|TERMINAL_BIN|${TERMINAL_BIN}|g" "$src" > "$dest"
    return
  fi
  if [[ "$src_name" == openbox-desktop-menu.xml ]]; then
    cat > "$dest" <<MENU
<?xml version="1.0" encoding="UTF-8"?>
<openbox_menu>
  <menu id="root-menu" label="Hosted Workspace">
    <item label="Chrome"><action name="Execute"><command>${HOME_DIR}/.hosted-browser/run-chrome.sh</command></action></item>
    <item label="Terminal"><action name="Execute"><command>${TERMINAL_BIN}</command></action></item>
    <item label="Restart Chrome"><action name="Execute"><command>${HOME_DIR}/.hosted-browser/restart-chrome.sh</command></action></item>
    <item label="Logout"><action name="Exit"/></item>
  </menu>
</openbox_menu>
MENU
  fi
}

if [[ "${SESSION_MODE}" == desktop ]]; then
  install_openbox_file openbox-desktop-menu.xml "${HOME_DIR}/.config/openbox/menu.xml"
  install_openbox_file openbox-desktop-rc.xml "${HOME_DIR}/.config/openbox/rc.xml"
  cat > "${HOME_DIR}/.vnc/xstartup" <<EOF
#!/bin/sh
xrdb \$HOME/.Xresources 2>/dev/null || true
openbox &
"${HOME_DIR}/.hosted-browser/run-chrome.sh" &
wait
EOF
else
  install_openbox_file openbox-kiosk-rc.xml "${HOME_DIR}/.config/openbox/rc.xml"
  rm -f "${HOME_DIR}/.config/openbox/menu.xml"
  cat > "${HOME_DIR}/.vnc/xstartup" <<EOF
#!/bin/sh
xrdb \$HOME/.Xresources 2>/dev/null || true
openbox &
n=0
while true; do
  "${HOME_DIR}/.hosted-browser/run-chrome.sh"
  if [ "${CHROME_RESTART}" != "on-exit" ]; then
    wait
    exit 0
  fi
  n=\$((n + 1))
  if [ "\$n" -gt 6 ]; then n=6; fi
  sleep \$(( ${COOLDOWN} * n ))
done
EOF
fi
chmod +x "${HOME_DIR}/.vnc/xstartup"

echo "[hosted-browser] Killing any existing display :${DISPLAY_NUM}..."
/usr/bin/vncserver -kill ":${DISPLAY_NUM}" 2>/dev/null || true

echo "[hosted-browser] Starting KasmVNC on display :${DISPLAY_NUM} mode=${SESSION_MODE} (HTTP/WS port ${VNC_PORT}, CDP port ${CDP_PORT})..."
exec /usr/bin/vncserver -fg ":${DISPLAY_NUM}" \
  -geometry 1920x1080 \
  -depth 24 \
  -websocketPort "${VNC_PORT}" \
  -interface 127.0.0.1 \
  -PasswordFile "${PASSWD_FILE}"
