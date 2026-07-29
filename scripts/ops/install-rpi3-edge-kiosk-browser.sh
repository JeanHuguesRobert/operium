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

PORTAL_URL="${PORTAL_URL:-http://127.0.0.1/}"
KIOSK_BROWSER="${KIOSK_BROWSER:-firefox-esr}"
LABWC_AUTOSTART="${HOME}/.config/labwc/autostart"
XDG_AUTOSTART_DIR="${HOME}/.config/autostart"
XDG_DESKTOP="${XDG_AUTOSTART_DIR}/operium-edge-kiosk.desktop"
MARKER_BEGIN="# BEGIN operium-edge-kiosk"
MARKER_END="# END operium-edge-kiosk"

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
cat >"${XDG_DESKTOP}.disabled" <<EOF
[Desktop Entry]
Type=Application
Name=Operium Edge Kiosk
Comment=Fractanet edge consultation portal (enable only if labwc block is removed)
Exec=${BROWSER} --kiosk ${PORTAL_URL}
Terminal=false
X-GNOME-Autostart-enabled=true
StartupNotify=false
EOF
rm -f "$XDG_DESKTOP" 2>/dev/null || true
echo "wrote ${XDG_DESKTOP}.disabled (active kiosk is labwc/autostart only)"

# --- labwc user autostart (Wayland session on Bookworm Pi) ---
mkdir -p "$(dirname "$LABWC_AUTOSTART")"
if [ ! -f "$LABWC_AUTOSTART" ]; then
  # Preserve common idle blanking if creating new file
  cat >"$LABWC_AUTOSTART" <<'EOF'
swayidle -w timeout 600 'wlopm --off \*' resume 'wlopm --on \*' &
EOF
fi

block=$(cat <<EOF
$MARKER_BEGIN
# Managed by install-rpi3-edge-kiosk-browser.sh — do not edit by hand
${BROWSER} --kiosk ${PORTAL_URL} &
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
  echo "# Operium edge kiosk (legacy LXDE path; labwc uses XDG + labwc/autostart)"
  echo "@${BROWSER} --kiosk ${PORTAL_URL}"
} >"$LX_AUTOSTART"
rm -f "$tmp"
echo "updated legacy $LX_AUTOSTART"

echo
echo "browser: $BROWSER"
echo "url:     $PORTAL_URL"
echo "stack:   labwc Wayland — primary hooks: XDG desktop + ~/.config/labwc/autostart"
echo "Apply:   log out/in of the graphical session, or reboot the Pi."
echo "Manual:  ${BROWSER} --kiosk ${PORTAL_URL}"
echo "Portal:  curl -fsS ${PORTAL_URL}status.json"
