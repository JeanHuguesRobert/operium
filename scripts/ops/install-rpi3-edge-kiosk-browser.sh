#!/usr/bin/env bash
# Install edge-portal kiosk browser autostart on rpi3-view (Raspberry Pi OS Bookworm).
#
# Observed desktop stack (2026-07): labwc Wayland + DESKTOP_SESSION=LXDE-pi-labwc.
# System labwc autostart runs lxsession-xdg-autostart — NOT ~/.config/lxsession/... alone.
#
# Prefer Firefox ESR (operator default; Chromium often fails with a stale
# SingletonLock from old hostname "baronpi").
#
# Run on the Pi as user jh:
#   bash install-rpi3-edge-kiosk-browser.sh
# Optional:
#   KIOSK_BROWSER=chromium bash install-rpi3-edge-kiosk-browser.sh
#   CLEAR_CHROMIUM_LOCK=1 bash install-rpi3-edge-kiosk-browser.sh
set -euo pipefail

# cgi-bin/home: server-rendered status (works in Dillo without JS). Full UI at /.
PORTAL_URL="${PORTAL_URL:-http://127.0.0.1/cgi-bin/home}"
# dillo default: Firefox thrashing on Pi 3 looks like "127.0.0.1 down".
KIOSK_BROWSER="${KIOSK_BROWSER:-dillo}"
# window (default): normal browser chrome, panel menus, Back / right-click.
# kiosk: full-screen lock-down (too restrictive for operator desk use).
KIOSK_MODE="${KIOSK_MODE:-window}"
# Wrapper waits for httpd before opening the browser (avoids boot race).
OPENER="${OPENER:-$HOME/bin/rpi3-view-open-edge-portal.sh}"
LABWC_AUTOSTART="${HOME}/.config/labwc/autostart"
XDG_AUTOSTART_DIR="${HOME}/.config/autostart"
XDG_DESKTOP="${XDG_AUTOSTART_DIR}/operium-edge-kiosk.desktop"
MARKER_BEGIN="# BEGIN operium-edge-kiosk"
MARKER_END="# END operium-edge-kiosk"

install_opener() {
  local src dir userjs
  dir="$(cd "$(dirname "$0")" && pwd)"
  src="${dir}/rpi3-view-open-edge-portal.sh"
  if [ ! -f "$src" ]; then
    if [ -f "$HOME/rpi3-view-open-edge-portal.sh" ]; then
      src="$HOME/rpi3-view-open-edge-portal.sh"
    elif [ -f /srv/cogentia/repos/operium/scripts/ops/rpi3-view-open-edge-portal.sh ]; then
      src=/srv/cogentia/repos/operium/scripts/ops/rpi3-view-open-edge-portal.sh
    fi
  fi
  mkdir -p "$(dirname "$OPENER")" "$HOME/bin"
  if [ -f "$src" ]; then
    cp -f "$src" "$OPENER"
  fi
  chmod +x "$OPENER" 2>/dev/null || true

  # user.js template beside opener for ensure_firefox_profile
  userjs="${dir}/../templates/rpi3-view/firefox-edge-portal-user.js"
  if [ ! -f "$userjs" ]; then
    userjs="${HOME}/firefox-edge-portal-user.js"
  fi
  if [ -f "$userjs" ]; then
    cp -f "$userjs" "$HOME/bin/firefox-edge-portal-user.js"
    cp -f "$userjs" "$HOME/firefox-edge-portal-user.js"
    echo "user.js template: $HOME/bin/firefox-edge-portal-user.js"
  fi

  if [ ! -x "$OPENER" ]; then
    echo "missing opener script at $OPENER (copy rpi3-view-open-edge-portal.sh there)" >&2
    return 1
  fi
  echo "opener: $OPENER"
}

browser_cmd() {
  # Prefer wait-for-portal wrapper; fall back to direct browser.
  if [ -x "$OPENER" ]; then
    printf 'env KIOSK_MODE=%s PORTAL_URL=%s BROWSER=%s %s' \
      "$KIOSK_MODE" "$PORTAL_URL" "$BROWSER" "$OPENER"
    return 0
  fi
  printf '%s %s' "$BROWSER" "$PORTAL_URL"
}

pick_browser() {
  case "$KIOSK_BROWSER" in
    firefox|firefox-esr)
      command -v firefox-esr || command -v firefox || true
      ;;
    chromium|chromium-browser)
      command -v chromium-browser || command -v chromium || true
      ;;
    auto)
      command -v firefox-esr || command -v firefox || command -v chromium-browser || command -v chromium || true
      ;;
    *)
      command -v "$KIOSK_BROWSER" || true
      ;;
  esac
}

BROWSER="$(pick_browser)"
if [ -z "$BROWSER" ]; then
  echo "no browser found for KIOSK_BROWSER=$KIOSK_BROWSER" >&2
  exit 1
fi

install_opener || true

# Optional: clear stale Chromium profile lock (old hostname baronpi → rpi3-view)
if [ "${CLEAR_CHROMIUM_LOCK:-0}" = "1" ]; then
  if pgrep -x chromium >/dev/null 2>&1 || pgrep -f '/usr/lib/chromium/chromium' >/dev/null 2>&1; then
    echo "chromium still running; not clearing SingletonLock" >&2
  else
    rm -f "${HOME}/.config/chromium/SingletonLock" \
          "${HOME}/.config/chromium/SingletonCookie" \
          "${HOME}/.config/chromium/SingletonSocket" 2>/dev/null || true
    echo "cleared Chromium Singleton* locks under ~/.config/chromium/"
  fi
fi

# --- XDG autostart: disabled by default under labwc (would double-launch with labwc/autostart) ---
# Keep a .desktop.disabled template for sessions that only use lxsession-xdg-autostart.
mkdir -p "$XDG_AUTOSTART_DIR"
CMD="$(browser_cmd)"
cat >"${XDG_DESKTOP}.disabled" <<EOF
[Desktop Entry]
Type=Application
Name=Operium Edge Portal
Comment=Fractanet edge consultation portal (enable only if labwc block is removed)
Exec=${CMD}
Terminal=false
X-GNOME-Autostart-enabled=true
StartupNotify=false
EOF
rm -f "$XDG_DESKTOP" 2>/dev/null || true
echo "wrote ${XDG_DESKTOP}.disabled (active launch is labwc/autostart only)"

# --- labwc user autostart (Wayland session on Bookworm Pi) ---
mkdir -p "$(dirname "$LABWC_AUTOSTART")"
if [ ! -f "$LABWC_AUTOSTART" ]; then
  # Preserve common idle blanking if creating new file
  cat >"$LABWC_AUTOSTART" <<'EOF'
swayidle -w timeout 600 'wlopm --off \*' resume 'wlopm --on \*' &
EOF
fi

CMD="$(browser_cmd)"
block=$(cat <<EOF
$MARKER_BEGIN
# Managed by install-rpi3-edge-kiosk-browser.sh — do not edit by hand
# KIOSK_MODE=${KIOSK_MODE} (window|kiosk)
${CMD} &
$MARKER_END
EOF
)

if grep -qF "$MARKER_BEGIN" "$LABWC_AUTOSTART" 2>/dev/null; then
  tmp="$(mktemp)"
  awk -v begin="$MARKER_BEGIN" -v end="$MARKER_END" '
    $0 == begin { skip=1; next }
    $0 == end { skip=0; next }
    !skip { print }
  ' "$LABWC_AUTOSTART" >"$tmp"
  printf '%s\n' "$block" >>"$tmp"
  mv "$tmp" "$LABWC_AUTOSTART"
  echo "updated block in $LABWC_AUTOSTART"
else
  printf '\n%s\n' "$block" >>"$LABWC_AUTOSTART"
  echo "appended block to $LABWC_AUTOSTART"
fi

# --- Legacy LXDE-pi autostart (only if someone switches back to X11/openbox) ---
LXDIR="${HOME}/.config/lxsession/LXDE-pi"
LX_AUTOSTART="${LXDIR}/autostart"
mkdir -p "$LXDIR"
if [ ! -f "$LX_AUTOSTART" ]; then
  if [ -f /etc/xdg/lxsession/LXDE-pi/autostart ]; then
    cp /etc/xdg/lxsession/LXDE-pi/autostart "$LX_AUTOSTART"
  else
    printf '%s\n' '@lxpanel --profile LXDE-pi' '@pcmanfm --desktop --profile LXDE-pi' >"$LX_AUTOSTART"
  fi
fi
tmp="$(mktemp)"
grep -vE 'operium edge kiosk|BEGIN operium-edge-kiosk|firefox(-esr)? --kiosk|chromium(-browser)? .*kiosk|127\.0\.0\.1/|localhost/' "$LX_AUTOSTART" >"$tmp" || true
{
  cat "$tmp"
  echo "# Operium edge portal (legacy LXDE path; labwc uses labwc/autostart)"
  echo "@${CMD}"
} >"$LX_AUTOSTART"
rm -f "$tmp"
echo "updated legacy $LX_AUTOSTART"

echo
echo "browser: $BROWSER"
echo "mode:    $KIOSK_MODE"
echo "cmd:     $CMD"
echo "url:     $PORTAL_URL"
echo "stack:   labwc Wayland — primary hook: ~/.config/labwc/autostart"
echo "Apply:   log out/in of the graphical session, or reboot the Pi."
echo "Manual:  $CMD"
echo "Portal:  curl -fsS ${PORTAL_URL}status.json"
