#!/bin/sh
# End the hosted KasmVNC session. Openbox Exit only kills the window manager
# and leaves a black X display, so reconnect never returns to the login page.
# This user owns the systemd unit; killing vncserver lets Restart=always spawn
# a fresh server. The next browser connect sees KasmVNC user/password again.

LOG="${HOSTED_BROWSER_SUPERVISOR_LOG:-${HOME}/.hosted-browser/supervisor.log}"
CLOSE_JS="${HOME}/.hosted-browser/graceful-close-hosted-browser.js"
if [ ! -f "$CLOSE_JS" ]; then
  CLOSE_JS="/opt/operium/bin/graceful-close-hosted-browser.js"
fi
CDP_PORT="${HOSTED_BROWSER_CDP_PORT:-9223}"
DISPLAY_ID="${DISPLAY:-:1}"

log() {
  mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) event=logout $*" >> "$LOG" 2>/dev/null || true
}

log "action=begin display=${DISPLAY_ID}"

if command -v node >/dev/null 2>&1 && [ -f "$CLOSE_JS" ]; then
  node "$CLOSE_JS" "$CDP_PORT" >>"$LOG" 2>&1 || log "action=graceful_cdp_failed"
fi

if command -v vncserver >/dev/null 2>&1; then
  log "action=vncserver_kill display=${DISPLAY_ID}"
  vncserver -kill "$DISPLAY_ID" >>"$LOG" 2>&1 || true
fi

pid_file="${HOME}/.vnc/$(hostname)${DISPLAY_ID}.pid"
if [ -f "$pid_file" ]; then
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -n "$pid" ]; then
    log "action=term_vnc_pid pid=${pid}"
    kill -TERM "$pid" 2>/dev/null || true
  fi
fi

# If vncserver is still the session leader, do not leave a WM-less X.
openbox --exit 2>/dev/null || true
exit 0
