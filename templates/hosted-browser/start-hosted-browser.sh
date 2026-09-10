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

# Fracta2 does not run Google Chrome; prefer an explicit env binary, then Brave, then Chromium.
BROWSER_BIN="${HOSTED_BROWSER_BINARY:-}"
if [[ -z "${BROWSER_BIN}" || ! -x "${BROWSER_BIN}" ]]; then
  BROWSER_BIN=""
  for candidate in /usr/bin/brave-browser /usr/bin/chromium-browser /usr/bin/chromium; do
    if [[ -x "$candidate" ]]; then
      BROWSER_BIN="$candidate"
      break
    fi
  done
fi
if [[ -z "${BROWSER_BIN}" ]]; then
  echo "[hosted-browser] no supported browser binary (set HOSTED_BROWSER_BINARY; Chrome is not used here)" >&2
  exit 69
fi

TERMINAL_BIN="xterm"
for candidate in x-terminal-emulator xterm xfce4-terminal lxterminal; do
  if command -v "$candidate" >/dev/null 2>&1; then
    TERMINAL_BIN="$(command -v "$candidate")"
    break
  fi
done

SUPERVISE_SRC="${TEMPLATE_DIR}/supervise-hosted-browser.sh"
if [[ ! -f "$SUPERVISE_SRC" ]]; then
  SUPERVISE_SRC="/opt/operium/bin/supervise-hosted-browser.sh"
fi
if [[ ! -f "$SUPERVISE_SRC" ]]; then
  SUPERVISE_SRC="$(cd "$(dirname "$0")" && pwd)/supervise-hosted-browser.sh"
fi
if [[ -f "$SUPERVISE_SRC" ]]; then
  install -m 0755 "$SUPERVISE_SRC" "${HOME_DIR}/.hosted-browser/supervise-hosted-browser.sh"
fi

cat > "${HOME_DIR}/.hosted-browser/run-browser.sh" <<EOF
#!/usr/bin/env bash
export HOSTED_BROWSER_BINARY="${BROWSER_BIN}"
export HOSTED_BROWSER_PROFILE_DIR="${USER_DATA_DIR}"
export HOSTED_BROWSER_START_URL="${START_URL}"
export HOSTED_BROWSER_CDP_PORT="${CDP_PORT}"
export HOSTED_CHROME_RESTART="${CHROME_RESTART}"
export HOSTED_CHROME_COOLDOWN_SECONDS="${COOLDOWN}"
export HOSTED_BROWSER_MAX_CRASH_STREAK="${HOSTED_BROWSER_MAX_CRASH_STREAK:-5}"
export HOSTED_BROWSER_SUPERVISOR_LOG="${HOME_DIR}/.hosted-browser/supervisor.log"
exec "${HOME_DIR}/.hosted-browser/supervise-hosted-browser.sh"
EOF
chmod +x "${HOME_DIR}/.hosted-browser/run-browser.sh"
# Keep the old name so the Openbox menu still works.
ln -sfn run-browser.sh "${HOME_DIR}/.hosted-browser/run-chrome.sh"

for helper in open-hosted-url.sh restart-hosted-browser.sh; do
  helper_src="${TEMPLATE_DIR}/${helper}"
  if [[ ! -f "$helper_src" ]]; then
    helper_src="/opt/operium/bin/${helper}"
  fi
  if [[ -f "$helper_src" ]]; then
    install -m 0755 "$helper_src" "${HOME_DIR}/.hosted-browser/${helper}"
  fi
done
ln -sfn restart-hosted-browser.sh "${HOME_DIR}/.hosted-browser/restart-chrome.sh"

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
    <item label="VS Code Insiders"><action name="Execute"><command>code-insiders --disable-gpu --ozone-platform=x11</command></action></item>
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
else
  install_openbox_file openbox-kiosk-rc.xml "${HOME_DIR}/.config/openbox/rc.xml"
  rm -f "${HOME_DIR}/.config/openbox/menu.xml"
fi
cat > "${HOME_DIR}/.vnc/xstartup" <<EOF
#!/bin/sh
xrdb \$HOME/.Xresources 2>/dev/null || true
openbox &
"${HOME_DIR}/.hosted-browser/run-browser.sh"
wait
EOF
chmod +x "${HOME_DIR}/.vnc/xstartup"

echo "[hosted-browser] Killing any existing display :${DISPLAY_NUM}..."
/usr/bin/vncserver -kill ":${DISPLAY_NUM}" 2>/dev/null || true

echo "[hosted-browser] Starting KasmVNC on display :${DISPLAY_NUM} mode=${SESSION_MODE} browser=${BROWSER_BIN} (HTTP/WS port ${VNC_PORT}, CDP port ${CDP_PORT})..."
exec /usr/bin/vncserver -fg ":${DISPLAY_NUM}" \
  -geometry 1920x1080 \
  -depth 24 \
  -websocketPort "${VNC_PORT}" \
  -interface 127.0.0.1 \
  -PasswordFile "${PASSWD_FILE}"
