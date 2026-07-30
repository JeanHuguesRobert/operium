#!/usr/bin/env bash
# Deploy edge portal static files + labwc polish to rpi3-view (run from workstation
# or copy to the Pi). Does not restart the graphical session (logout/reboot for
# labwc rc.xml / autostart).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${RPI3_HOST:-rpi3-view}"
PORTAL_DIR="${PORTAL_DIR:-/srv/operium-edge-portal}"

echo "Deploy portal → ${HOST}:${PORTAL_DIR}"
scp -o BatchMode=yes \
  "$ROOT/apps/edge-portal/index.html" \
  "$ROOT/apps/edge-portal/boot.html" \
  "$ROOT/apps/edge-portal/simple.html" \
  "${HOST}:${PORTAL_DIR}/"

ssh -o BatchMode=yes "$HOST" "mkdir -p ${PORTAL_DIR}/cgi-bin ${PORTAL_DIR}/cache/nodes"
scp -o BatchMode=yes \
  "$ROOT/apps/edge-portal/cgi-bin/home" \
  "$ROOT/apps/edge-portal/cgi-bin/refresh" \
  "$ROOT/apps/edge-portal/cgi-bin/fleet" \
  "$ROOT/apps/edge-portal/cgi-bin/node" \
  "$ROOT/apps/edge-portal/cgi-bin/action" \
  "${HOST}:${PORTAL_DIR}/cgi-bin/"

ssh -o BatchMode=yes "$HOST" "chmod +x ${PORTAL_DIR}/cgi-bin/home ${PORTAL_DIR}/cgi-bin/refresh ${PORTAL_DIR}/cgi-bin/fleet ${PORTAL_DIR}/cgi-bin/node ${PORTAL_DIR}/cgi-bin/action"

# P4 cache warmer (timer + optional manual)
scp -o BatchMode=yes \
  "$ROOT/scripts/ops/rpi3-view-warm-node-cache.sh" \
  "$ROOT/scripts/ops/rpi3-view-edge-portal-refresh.sh" \
  "${HOST}:~/bin/"
ssh -o BatchMode=yes "$HOST" "chmod +x ~/bin/rpi3-view-warm-node-cache.sh ~/bin/rpi3-view-edge-portal-refresh.sh 2>/dev/null || true"

# Opener + Firefox prefs + labwc
ssh -o BatchMode=yes "$HOST" 'mkdir -p ~/bin ~/.config/labwc ~/.mozilla/firefox/operium-edge.profile'
scp -o BatchMode=yes \
  "$ROOT/scripts/ops/rpi3-view-open-edge-portal.sh" \
  "${HOST}:~/bin/rpi3-view-open-edge-portal.sh"
scp -o BatchMode=yes \
  "$ROOT/scripts/ops/rpi3-view-open-edge-portal.sh" \
  "${HOST}:~/rpi3-view-open-edge-portal.sh"
scp -o BatchMode=yes \
  "$ROOT/templates/rpi3-view/firefox-edge-portal-user.js" \
  "${HOST}:~/bin/firefox-edge-portal-user.js"
scp -o BatchMode=yes \
  "$ROOT/templates/rpi3-view/labwc-autostart-edge-portal" \
  "${HOST}:~/.config/labwc/autostart"
scp -o BatchMode=yes \
  "$ROOT/templates/rpi3-view/labwc-rc.xml.fragment" \
  "${HOST}:~/.config/labwc/rc.xml"

ssh -o BatchMode=yes "$HOST" '
  chmod +x ~/bin/rpi3-view-open-edge-portal.sh ~/rpi3-view-open-edge-portal.sh
  cp -f ~/bin/firefox-edge-portal-user.js ~/.mozilla/firefox/operium-edge.profile/user.js 2>/dev/null || true
  curl -fsS -m 3 -o /dev/null -w "index=%{http_code}\n" http://127.0.0.1/
  curl -fsS -m 3 -o /dev/null -w "boot=%{http_code}\n" http://127.0.0.1/boot.html
  curl -fsS -m 3 -o /dev/null -w "home=%{http_code}\n" http://127.0.0.1/cgi-bin/home
  echo "labwc rc/autostart updated — re-login or reboot for window maximize rules"
'

echo "Done."
