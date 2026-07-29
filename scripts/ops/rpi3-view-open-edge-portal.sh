#!/usr/bin/env bash
# Wait for the local edge portal, then open a LIGHT browser window.
#
# Pi 3 has ~1 GB RAM. Firefox ESR multi-process often thrashes (300–500 MB+)
# and the UI looks like "127.0.0.1 does not respond". Default browser is therefore
# Dillo (already on Raspberry Pi OS). Override with BROWSER=firefox-esr if needed.
#
# Profile picker: Firefox path uses absolute -profile only (never -P name).
set -u

# cgi-bin/home: server-rendered HTML (Dillo has no JS). Falls back in wait loop.
PORTAL_URL="${PORTAL_URL:-http://127.0.0.1/cgi-bin/home}"
BROWSER="${BROWSER:-}"
MAX_WAIT_SEC="${MAX_WAIT_SEC:-120}"
FF_PROFILE_NAME="${FF_PROFILE_NAME:-operium-edge}"
FF_PROFILE_DIR="${FF_PROFILE_DIR:-$HOME/.mozilla/firefox/${FF_PROFILE_NAME}.profile}"
LOG="${HOME}/.cogentia/var/edge-portal-open.log"
# After HTTP 200, wait for boot load to drop a bit (optional).
POST_READY_SLEEP="${POST_READY_SLEEP:-5}"

mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
log() { echo "$@" >>"$LOG" 2>/dev/null || true; }

log "---- $(date -Is) open edge portal ----"
log "url=$PORTAL_URL max_wait=${MAX_WAIT_SEC}s"

pick_browser() {
  if [ -n "$BROWSER" ]; then
    command -v "$BROWSER" >/dev/null 2>&1 && { command -v "$BROWSER"; return; }
  fi
  # Prefer light UI for home portal on Pi 3.
  for c in dillo chromium-browser chromium firefox-esr firefox; do
    if command -v "$c" >/dev/null 2>&1; then
      command -v "$c"
      return
    fi
  done
  return 1
}

BROWSER_PATH="$(pick_browser || true)"
if [ -z "${BROWSER_PATH:-}" ]; then
  log "no browser found"
  exit 1
fi
BROWSER_BASE="$(basename "$BROWSER_PATH")"
log "browser=$BROWSER_PATH ($BROWSER_BASE)"

case "$PORTAL_URL" in
  http://localhost/*|http://localhost)
    PORTAL_URL="http://127.0.0.1/${PORTAL_URL#http://localhost/}"
    PORTAL_URL="${PORTAL_URL%/}"
    [ "$PORTAL_URL" = "http://127.0.0.1" ] && PORTAL_URL="http://127.0.0.1/simple.html"
    ;;
esac

ensure_firefox_profile() {
  mkdir -p "$FF_PROFILE_DIR"
  local ujs="${HOME}/bin/firefox-edge-portal-user.js"
  if [ -f "$ujs" ]; then
    cp -f "$ujs" "${FF_PROFILE_DIR}/user.js"
  fi
  rm -f "${FF_PROFILE_DIR}/sessionstore.jsonlz4" \
        "${FF_PROFILE_DIR}/sessionCheckpoints.json" \
        "${FF_PROFILE_DIR}/.parentlock" \
        "${FF_PROFILE_DIR}/lock" 2>/dev/null || true
  rm -rf "${FF_PROFILE_DIR}/sessionstore-backups" 2>/dev/null || true
  mkdir -p "${FF_PROFILE_DIR}/sessionstore-backups"
}

ready=0
i=0
while [ "$i" -lt "$MAX_WAIT_SEC" ]; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 "$PORTAL_URL" 2>/dev/null || echo 000)"
  if [ "$code" = "200" ]; then
    ready=1
    break
  fi
  # Also accept root if simple.html not yet deployed
  code2="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1/ 2>/dev/null || echo 000)"
  if [ "$code2" = "200" ]; then
    ready=1
    break
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$ready" != "1" ]; then
  log "portal not ready after ${MAX_WAIT_SEC}s — opening anyway"
else
  log "portal ready after ${i}s (HTTP 200)"
  sleep "$POST_READY_SLEEP"
fi

# labwc Wayland session: X11 apps (Dillo) need XWayland DISPLAY.
if [ -z "${DISPLAY:-}" ] && [ -S /tmp/.X11-unix/X0 ]; then
  export DISPLAY=:0
fi
if [ -z "${XAUTHORITY:-}" ] && [ -f "${HOME}/.Xauthority" ]; then
  export XAUTHORITY="${HOME}/.Xauthority"
fi
if [ -z "${XDG_RUNTIME_DIR:-}" ] && [ -d "/run/user/$(id -u)" ]; then
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
fi
if [ -z "${WAYLAND_DISPLAY:-}" ] && [ -S "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/wayland-0" ]; then
  export WAYLAND_DISPLAY=wayland-0
fi

case "$BROWSER_BASE" in
  dillo)
    log "exec dillo $PORTAL_URL (DISPLAY=${DISPLAY:-unset})"
    exec dillo "$PORTAL_URL"
    ;;
  chromium|chromium-browser)
    # Light-ish flags for Pi; dedicated temp profile avoids baronpi lock.
    CH_PROF="${HOME}/.config/operium-edge-chromium"
    mkdir -p "$CH_PROF"
    log "exec $BROWSER_PATH --user-data-dir=$CH_PROF --no-first-run --disable-session-crashed-bubble $PORTAL_URL"
    exec "$BROWSER_PATH" \
      --user-data-dir="$CH_PROF" \
      --no-first-run \
      --disable-session-crashed-bubble \
      --check-for-update-interval=31536000 \
      --disable-features=TranslateUI \
      --new-window \
      "$PORTAL_URL"
    ;;
  firefox|firefox-esr)
    ensure_firefox_profile
    export MOZ_WEBRENDER="${MOZ_WEBRENDER:-0}"
    if [ "${KIOSK_MODE:-window}" = "kiosk" ]; then
      log "exec $BROWSER_PATH -profile $FF_PROFILE_DIR --no-remote --kiosk $PORTAL_URL"
      exec "$BROWSER_PATH" -profile "$FF_PROFILE_DIR" --no-remote --kiosk "$PORTAL_URL"
    else
      log "exec $BROWSER_PATH -profile $FF_PROFILE_DIR --no-remote --new-window $PORTAL_URL"
      exec "$BROWSER_PATH" -profile "$FF_PROFILE_DIR" --no-remote --new-window "$PORTAL_URL"
    fi
    ;;
  *)
    log "exec $BROWSER_PATH $PORTAL_URL"
    exec "$BROWSER_PATH" "$PORTAL_URL"
    ;;
esac
