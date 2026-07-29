#!/usr/bin/env bash
# Install Chromium kiosk autostart for the Operium edge portal on rpi3-view.
# Run on the Pi as user jh:
#   bash install-rpi3-edge-kiosk-browser.sh
# Or from workstation:
#   scp ... && ssh rpi3-view bash install-rpi3-edge-kiosk-browser.sh
set -euo pipefail

PORTAL_URL="${PORTAL_URL:-http://127.0.0.1/}"
LXDIR="${HOME}/.config/lxsession/LXDE-pi"
AUTOSTART="${LXDIR}/autostart"
BROWSER="$(command -v chromium-browser || command -v chromium || true)"

if [ -z "$BROWSER" ]; then
  echo "chromium not found; install chromium-browser first" >&2
  exit 1
fi

mkdir -p "$LXDIR"

# Prefer Operium-managed full autostart when no custom user file exists yet.
if [ ! -f "$AUTOSTART" ]; then
  if [ -f /etc/xdg/lxsession/LXDE-pi/autostart ]; then
    cp /etc/xdg/lxsession/LXDE-pi/autostart "$AUTOSTART"
  else
    cat >"$AUTOSTART" <<'EOF'
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@xscreensaver -no-splash
EOF
  fi
fi

# Remove prior Operium kiosk lines, then append a single managed line.
tmp="$(mktemp)"
grep -vE 'operium edge kiosk|chromium(-browser)? .*kiosk|127\.0\.0\.1/|localhost/' "$AUTOSTART" >"$tmp" || true
{
  cat "$tmp"
  echo "# Operium edge kiosk — managed by install-rpi3-edge-kiosk-browser.sh"
  echo "@${BROWSER} --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --check-for-update-interval=31536000 ${PORTAL_URL}"
} >"$AUTOSTART"
rm -f "$tmp"

echo "wrote $AUTOSTART"
echo "browser: $BROWSER"
echo "url: $PORTAL_URL"
echo "Apply: log out/in of the graphical session, or restart the Pi."
echo "Smoke now (needs DISPLAY): DISPLAY=:0 $BROWSER --app=${PORTAL_URL} &"
