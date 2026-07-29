#!/usr/bin/env bash
# Wait for the local edge portal, then open it in a normal Firefox window.
# Used from labwc autostart so a cold boot does not show "Unable to connect".
set -u

PORTAL_URL="${PORTAL_URL:-http://127.0.0.1/}"
BROWSER="${BROWSER:-}"
MAX_WAIT_SEC="${MAX_WAIT_SEC:-90}"
LOG="${HOME}/.cogentia/var/edge-portal-open.log"

mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
{
  echo "---- $(date -Is) open edge portal ----"
  echo "url=$PORTAL_URL max_wait=${MAX_WAIT_SEC}s"
} >>"$LOG" 2>/dev/null || true

if [ -z "$BROWSER" ]; then
  if command -v firefox-esr >/dev/null 2>&1; then
    BROWSER=firefox-esr
  elif command -v firefox >/dev/null 2>&1; then
    BROWSER=firefox
  elif command -v chromium-browser >/dev/null 2>&1; then
    BROWSER=chromium-browser
  elif command -v chromium >/dev/null 2>&1; then
    BROWSER=chromium
  else
    echo "no browser found" >>"$LOG" 2>/dev/null || true
    exit 1
  fi
fi

# Prefer loopback IPv4; some stacks resolve localhost to ::1 first.
case "$PORTAL_URL" in
  http://localhost/*|http://localhost)
    PORTAL_URL="http://127.0.0.1/${PORTAL_URL#http://localhost/}"
    PORTAL_URL="${PORTAL_URL%/}"
    [ "$PORTAL_URL" = "http://127.0.0.1" ] && PORTAL_URL="http://127.0.0.1/"
    ;;
esac

ready=0
i=0
while [ "$i" -lt "$MAX_WAIT_SEC" ]; do
  if curl -fsS --max-time 2 -o /dev/null "$PORTAL_URL" 2>/dev/null; then
    ready=1
    break
  fi
  # Also accept plain TCP open on :80
  if command -v nc >/dev/null 2>&1; then
    if nc -z 127.0.0.1 80 2>/dev/null; then
      # Port open but HTTP not ready yet — keep waiting a bit
      :
    fi
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$ready" != "1" ]; then
  echo "portal not ready after ${MAX_WAIT_SEC}s — opening anyway" >>"$LOG" 2>/dev/null || true
else
  echo "portal ready after ${i}s" >>"$LOG" 2>/dev/null || true
fi

# Normal window (menus, Back, right-click). Kiosk only if KIOSK_MODE=kiosk.
if [ "${KIOSK_MODE:-window}" = "kiosk" ]; then
  exec "$BROWSER" --kiosk "$PORTAL_URL"
else
  exec "$BROWSER" --new-window "$PORTAL_URL"
fi
