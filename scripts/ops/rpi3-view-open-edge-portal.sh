#!/usr/bin/env bash
# Wait for local edge portal (HTTP 200), then open Firefox (default) without
# profile-manager UI. Dillo remains an optional light fallback (BROWSER=dillo).
#
# Why not blame RAM alone: under calm load Firefox successfully recorded a visit
# to http://127.0.0.1/ (places.sqlite) while portal stayed HTTP 200. Boot races,
# profile picker, offline heuristics, and hung sessions are the primary suspects.
set -u

# boot.html retries until status.json works, then redirects to /. Softens slow first paint.
PORTAL_URL="${PORTAL_URL:-http://127.0.0.1/boot.html}"
BROWSER="${BROWSER:-firefox-esr}"
# kiosk = F11-like (no chrome); window = normal window for debug.
KIOSK_MODE="${KIOSK_MODE:-kiosk}"
MAX_WAIT_SEC="${MAX_WAIT_SEC:-120}"
# After httpd is up, wait more: Firefox cold-start on Pi 3 often needs 15–40s
# before the first navigation to 127.0.0.1 actually paints (user observation).
POST_READY_SLEEP="${POST_READY_SLEEP:-20}"
FF_PROFILE_NAME="${FF_PROFILE_NAME:-operium-edge}"
FF_PROFILE_DIR="${FF_PROFILE_DIR:-$HOME/.mozilla/firefox/${FF_PROFILE_NAME}.profile}"
LOG="${HOME}/.cogentia/var/edge-portal-open.log"

mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
log() { echo "$@" >>"$LOG" 2>/dev/null || true; }

log "---- $(date -Is) open edge portal ----"
log "url=$PORTAL_URL browser=$BROWSER wait=${MAX_WAIT_SEC}s"

# Resolve browser binary
if ! command -v "$BROWSER" >/dev/null 2>&1; then
  for c in firefox-esr firefox chromium-browser chromium dillo; do
    if command -v "$c" >/dev/null 2>&1; then BROWSER="$c"; break; fi
  done
fi
BROWSER_PATH="$(command -v "$BROWSER" || true)"
if [ -z "$BROWSER_PATH" ]; then
  log "no browser found"
  exit 1
fi
BROWSER_BASE="$(basename "$BROWSER_PATH")"
log "using $BROWSER_PATH"

case "$PORTAL_URL" in
  http://localhost|http://localhost/*)
    PORTAL_URL="http://127.0.0.1/${PORTAL_URL#http://localhost/}"
    [ "$PORTAL_URL" = "http://127.0.0.1/" ] || true
    PORTAL_URL="${PORTAL_URL%/}"
    case "$PORTAL_URL" in
      http://127.0.0.1) PORTAL_URL="http://127.0.0.1/" ;;
    esac
    ;;
esac

# Display for X11 apps under labwc
if [ -z "${DISPLAY:-}" ] && [ -S /tmp/.X11-unix/X0 ]; then export DISPLAY=:0; fi
if [ -z "${XAUTHORITY:-}" ] && [ -f "$HOME/.Xauthority" ]; then export XAUTHORITY="$HOME/.Xauthority"; fi
if [ -z "${XDG_RUNTIME_DIR:-}" ] && [ -d "/run/user/$(id -u)" ]; then export XDG_RUNTIME_DIR="/run/user/$(id -u)"; fi
if [ -z "${WAYLAND_DISPLAY:-}" ] && [ -S "${XDG_RUNTIME_DIR:-}/wayland-0" ]; then export WAYLAND_DISPLAY=wayland-0; fi

ensure_firefox_profile() {
  mkdir -p "$FF_PROFILE_DIR"
  local ujs="${HOME}/bin/firefox-edge-portal-user.js"
  if [ -f "$ujs" ]; then
    cp -f "$ujs" "${FF_PROFILE_DIR}/user.js"
  fi
  # Clear crash/session restore + stale locks from hard reboot
  rm -f "${FF_PROFILE_DIR}/sessionstore.jsonlz4" \
        "${FF_PROFILE_DIR}/sessionCheckpoints.json" \
        "${FF_PROFILE_DIR}/.parentlock" \
        "${FF_PROFILE_DIR}/lock" 2>/dev/null || true
  rm -rf "${FF_PROFILE_DIR}/sessionstore-backups" 2>/dev/null || true
  mkdir -p "${FF_PROFILE_DIR}/sessionstore-backups"
  log "profile $FF_PROFILE_DIR ready"
}

# Wait for real HTTP 200 (not just TCP)
ready=0
i=0
while [ "$i" -lt "$MAX_WAIT_SEC" ]; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 "$PORTAL_URL" 2>/dev/null || echo 000)"
  if [ "$code" = "200" ]; then ready=1; break; fi
  # root as fallback if path not yet deployed
  code2="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1/ 2>/dev/null || echo 000)"
  if [ "$code2" = "200" ]; then ready=1; break; fi
  i=$((i + 1))
  sleep 1
done
if [ "$ready" = "1" ]; then
  log "portal HTTP 200 after ${i}s"
  sleep "$POST_READY_SLEEP"
else
  log "portal not ready after ${MAX_WAIT_SEC}s — opening anyway"
fi

# Early in boot, compositor + Firefox need more wall time than httpd.
# Observed: 127.0.0.1 often paints only after a long first load, not because httpd is down.
uptime_s="$(cut -d. -f1 /proc/uptime 2>/dev/null || echo 999)"
if [ "$uptime_s" -lt 120 ]; then
  extra=$((120 - uptime_s))
  if [ "$extra" -gt 0 ]; then
    log "system uptime ${uptime_s}s — extra settle ${extra}s before browser"
    sleep "$extra"
  fi
fi

case "$BROWSER_BASE" in
  dillo)
    log "exec dillo $PORTAL_URL"
    exec dillo "$PORTAL_URL"
    ;;
  chromium|chromium-browser)
    CH_PROF="${HOME}/.config/operium-edge-chromium"
    mkdir -p "$CH_PROF"
    log "exec chromium $PORTAL_URL"
    exec "$BROWSER_PATH" --user-data-dir="$CH_PROF" --no-first-run \
      --disable-session-crashed-bubble --new-window "$PORTAL_URL"
    ;;
  firefox|firefox-esr|*)
    ensure_firefox_profile
    # Absolute -profile only (never -P name → profile manager)
    if [ "${KIOSK_MODE:-window}" = "kiosk" ]; then
      log "exec firefox -profile … --kiosk $PORTAL_URL"
      exec "$BROWSER_PATH" -profile "$FF_PROFILE_DIR" --no-remote --kiosk "$PORTAL_URL"
    else
      log "exec firefox -profile … --new-window $PORTAL_URL"
      exec "$BROWSER_PATH" -profile "$FF_PROFILE_DIR" --no-remote --new-window "$PORTAL_URL"
    fi
    ;;
esac
