#!/bin/sh
# Restart the hosted browser without starting a second supervisor.
# Prefer a graceful CDP Browser.close so Brave does not treat the exit as a crash
# ("Something went wrong when opening your profile").

PROFILE="${HOSTED_BROWSER_PROFILE_DIR:-${HOME}/.hosted-browser/chromium-profile}"
LOG="${HOSTED_BROWSER_SUPERVISOR_LOG:-${HOME}/.hosted-browser/supervisor.log}"
PID_FILE="${HOME}/.hosted-browser/supervisor.pid"
RUN_BROWSER="${HOME}/.hosted-browser/run-browser.sh"
CDP_PORT="${HOSTED_BROWSER_CDP_PORT:-9223}"
CLOSE_JS="${HOME}/.hosted-browser/graceful-close-hosted-browser.js"
if [ ! -f "$CLOSE_JS" ]; then
  CLOSE_JS="/opt/operium/bin/graceful-close-hosted-browser.js"
fi

log() {
  mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) event=restart $*" >> "$LOG" 2>/dev/null || true
}

supervisor_alive() {
  if [ -f "$PID_FILE" ]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  fi
  pgrep -u "$(id -u)" -f 'supervise-hosted-browser.sh' >/dev/null 2>&1
}

browser_alive() {
  pgrep -u "$(id -u)" -f -- "--user-data-dir=${PROFILE}" >/dev/null 2>&1
}

main_browser_pids() {
  pgrep -u "$(id -u)" -f -- "--user-data-dir=${PROFILE}" 2>/dev/null | while read -r pid; do
    [ -r "/proc/${pid}/cmdline" ] || continue
    cmd="$(tr '\0' ' ' < "/proc/${pid}/cmdline")"
    case "$cmd" in
      *--type=*) continue ;;
      *) printf '%s\n' "$pid" ;;
    esac
  done
}

wait_browser_gone() {
  tries="$1"
  i=0
  while [ "$i" -lt "$tries" ]; do
    browser_alive || return 0
    i=$((i + 1))
    sleep 0.2
  done
  browser_alive && return 1
  return 0
}

cleared_locks=0
clear_profile_locks() {
  rm -f \
    "${PROFILE}/SingletonLock" \
    "${PROFILE}/SingletonSocket" \
    "${PROFILE}/SingletonCookie" \
    "${PROFILE}/Default/lockfile" \
    "${PROFILE}/lockfile" 2>/dev/null || true
  cleared_locks=1
}

mark_profile_clean() {
  if browser_alive; then
    return 1
  fi
  if command -v node >/dev/null 2>&1 && [ -f "$CLOSE_JS" ]; then
    log "action=mark_clean"
    node "$CLOSE_JS" --mark-clean "$PROFILE" >>"$LOG" 2>&1 || log "action=mark_clean_failed"
  fi
}

if browser_alive; then
  log "action=graceful_cdp port=${CDP_PORT}"
  if command -v node >/dev/null 2>&1 && [ -f "$CLOSE_JS" ]; then
    node "$CLOSE_JS" "$CDP_PORT" >>"$LOG" 2>&1 || log "action=graceful_cdp_failed"
  else
    log "action=graceful_cdp_skipped"
  fi
  wait_browser_gone 50 || true
  sleep 0.4
  mark_profile_clean || true
fi

if browser_alive; then
  log "action=term_main"
  for pid in $(main_browser_pids); do
    kill -TERM "$pid" 2>/dev/null || true
  done
  wait_browser_gone 40 || true
fi

if browser_alive; then
  log "action=kill"
  pkill -KILL -u "$(id -u)" -f -- "--user-data-dir=${PROFILE}" 2>/dev/null || true
  sleep 0.4
  clear_profile_locks
  log "action=clear_locks_after_kill"
fi

if ! browser_alive; then
  mark_profile_clean || true
fi

if supervisor_alive; then
  log "action=signal_existing_supervisor cleared_locks=${cleared_locks}"
  exit 0
fi

log "action=start_supervisor"
if [ -x "$RUN_BROWSER" ]; then
  exec "$RUN_BROWSER"
fi
echo "no hosted-browser supervisor to restart" >&2
exit 69
