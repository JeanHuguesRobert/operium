#!/bin/sh
# Restart the hosted browser without starting a second supervisor.
# A second instance on the same user-data-dir causes Brave/Chromium
# "Something went wrong when opening your profile".

PROFILE="${HOSTED_BROWSER_PROFILE_DIR:-${HOME}/.hosted-browser/chromium-profile}"
LOG="${HOSTED_BROWSER_SUPERVISOR_LOG:-${HOME}/.hosted-browser/supervisor.log}"
PID_FILE="${HOME}/.hosted-browser/supervisor.pid"
RUN_BROWSER="${HOME}/.hosted-browser/run-browser.sh"

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

pkill -TERM -u "$(id -u)" -f -- "--user-data-dir=${PROFILE}" 2>/dev/null || true
i=0
while [ "$i" -lt 25 ]; do
  browser_alive || break
  i=$((i + 1))
  sleep 0.2
done
if browser_alive; then
  pkill -KILL -u "$(id -u)" -f -- "--user-data-dir=${PROFILE}" 2>/dev/null || true
  sleep 0.4
fi

rm -f \
  "${PROFILE}/SingletonLock" \
  "${PROFILE}/SingletonSocket" \
  "${PROFILE}/SingletonCookie" \
  "${PROFILE}/Default/lockfile" \
  "${PROFILE}/lockfile" 2>/dev/null || true

if supervisor_alive; then
  log "action=signal_existing_supervisor"
  exit 0
fi

log "action=start_supervisor"
if [ -x "$RUN_BROWSER" ]; then
  exec "$RUN_BROWSER"
fi
echo "no hosted-browser supervisor to restart" >&2
exit 69
