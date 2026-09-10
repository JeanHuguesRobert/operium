#!/usr/bin/env bash
# Supervises one hosted-browser executable. Does not start KasmVNC or Openbox.
# Logs start/exit/backoff to a file the workspace user can read.
# Google Chrome is last-resort only; this FractaNode uses Brave (or Chromium).

set -u

LOG_FILE="${HOSTED_BROWSER_SUPERVISOR_LOG:-${HOME}/.hosted-browser/supervisor.log}"
PROFILE_DIR="${HOSTED_BROWSER_PROFILE_DIR:-${HOME}/.hosted-browser/chromium-profile}"
START_URL="${HOSTED_BROWSER_START_URL:-https://chatgpt.com}"
CDP_PORT="${HOSTED_BROWSER_CDP_PORT:-9223}"
COOLDOWN="${HOSTED_CHROME_COOLDOWN_SECONDS:-5}"
RESTART="${HOSTED_CHROME_RESTART:-on-exit}"
HEALTHY_SECONDS="${HOSTED_BROWSER_HEALTHY_SECONDS:-45}"
MAX_BACKOFF_MULT="${HOSTED_BROWSER_BACKOFF_CAP:-8}"
MAX_RUNS="${HOSTED_SUPERVISE_MAX_RUNS:-0}"
MAX_CRASH_STREAK="${HOSTED_BROWSER_MAX_CRASH_STREAK:-5}"
CLEAR_LOCKS="${HOSTED_BROWSER_CLEAR_LOCKS:-always}"
PID_FILE="${HOSTED_BROWSER_SUPERVISOR_PID:-${HOME}/.hosted-browser/supervisor.pid}"

mkdir -p "$(dirname "$LOG_FILE")" "$PROFILE_DIR"

if ! [[ "${COOLDOWN}" =~ ^[0-9]+$ ]] || ((COOLDOWN < 1)); then
  COOLDOWN=5
fi
if ! [[ "${HEALTHY_SECONDS}" =~ ^[0-9]+$ ]]; then
  HEALTHY_SECONDS=45
fi
if ! [[ "${MAX_CRASH_STREAK}" =~ ^[0-9]+$ ]] || ((MAX_CRASH_STREAK < 1)); then
  MAX_CRASH_STREAK=5
fi

rotate_log() {
  if [[ -f "$LOG_FILE" ]]; then
    local bytes
    bytes="$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)"
    if ((bytes > 524288)); then
      tail -n 400 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
    fi
  fi
}

log_event() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"
  rotate_log
  printf '%s\n' "$line" >> "$LOG_FILE" || true
  logger -t hosted-browser-supervisor -- "$line" 2>/dev/null || true
}

resolve_browser() {
  if [[ -n "${HOSTED_BROWSER_BINARY:-}" && -x "${HOSTED_BROWSER_BINARY}" ]]; then
    printf '%s' "${HOSTED_BROWSER_BINARY}"
    return 0
  fi
  local candidate
  for candidate in /usr/bin/brave-browser /usr/bin/chromium-browser /usr/bin/chromium; do
    if [[ -x "$candidate" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  if [[ -x /usr/bin/google-chrome ]]; then
    printf '%s' /usr/bin/google-chrome
    return 0
  fi
  return 1
}

clear_profile_locks() {
  rm -f \
    "${PROFILE_DIR}/SingletonLock" \
    "${PROFILE_DIR}/SingletonSocket" \
    "${PROFILE_DIR}/SingletonCookie" \
    "${PROFILE_DIR}/Default/lockfile" \
    "${PROFILE_DIR}/lockfile" 2>/dev/null || true
}

requested_exit() {
  case "$1" in
    0|129|130|143) return 0 ;;
    *) return 1 ;;
  esac
}

CLOSE_JS="${HOME}/.hosted-browser/graceful-close-hosted-browser.js"
if [[ ! -f "$CLOSE_JS" ]]; then
  CLOSE_JS="/opt/operium/bin/graceful-close-hosted-browser.js"
fi

mark_profile_clean() {
  if command -v node >/dev/null 2>&1 && [[ -f "$CLOSE_JS" ]]; then
    node "$CLOSE_JS" --mark-clean "$PROFILE_DIR" >>"$LOG_FILE" 2>&1 || log_event "event=mark_clean_failed"
  fi
}

printf '%s\n' "$$" > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT

BROWSER_BIN="$(resolve_browser || true)"
if [[ -z "$BROWSER_BIN" ]]; then
  log_event "event=fatal reason=no_browser_binary"
  exit 69
fi

log_event "event=supervisor_start binary=${BROWSER_BIN} profile=${PROFILE_DIR} cdp=${CDP_PORT} restart=${RESTART} cooldown=${COOLDOWN}s healthy_after=${HEALTHY_SECONDS}s max_crash_streak=${MAX_CRASH_STREAK}"

streak=0
run=0
last_was_crash=1

while true; do
  run=$((run + 1))
  if ((MAX_RUNS > 0 && run > MAX_RUNS)); then
    log_event "event=stop reason=max_runs runs=${MAX_RUNS}"
    exit 0
  fi
  if pgrep -u "$(id -u)" -f -- "--user-data-dir=${PROFILE_DIR}" >/dev/null 2>&1; then
    log_event "event=skip_start reason=profile_in_use"
    sleep "$COOLDOWN"
    continue
  fi
  if [[ "$CLEAR_LOCKS" == always ]] || [[ "$CLEAR_LOCKS" == on-crash && "$last_was_crash" == 1 ]]; then
    clear_profile_locks
    log_event "event=clear_locks profile=${PROFILE_DIR}"
  fi
  mark_profile_clean

  log_event "event=start run=${run} streak=${streak} binary=${BROWSER_BIN}"
  start_ts="$(date +%s)"
  "$BROWSER_BIN" \
    --user-data-dir="${PROFILE_DIR}" \
    --no-first-run \
    --no-default-browser-check \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port="${CDP_PORT}" \
    --disable-dev-shm-usage \
    --disable-gpu \
    --window-size=1920,1080 \
    --window-position=0,0 \
    "${START_URL}"
  code=$?
  end_ts="$(date +%s)"
  duration=$((end_ts - start_ts))
  if ((duration < 0)); then duration=0; fi

  if requested_exit "$code"; then
    streak=0
    last_was_crash=0
    crash=0
    sleep_s=2
    mark_profile_clean
  elif ((duration >= HEALTHY_SECONDS)); then
    streak=0
    last_was_crash=0
    crash=0
    sleep_s=$COOLDOWN
  else
    streak=$((streak + 1))
    last_was_crash=1
    crash=1
    sleep_s=0
  fi

  if [[ "$RESTART" == on-exit && "$crash" == 1 ]]; then
    mult="$streak"
    if ((mult < 1)); then mult=1; fi
    if ((mult > MAX_BACKOFF_MULT)); then mult=$MAX_BACKOFF_MULT; fi
    sleep_s=$((COOLDOWN * mult))
  fi

  log_event "event=exit run=${run} code=${code} duration_s=${duration} crash=${crash} streak=${streak} next_sleep_s=${sleep_s}"

  if [[ "$RESTART" != on-exit ]]; then
    log_event "event=stop reason=restart_off code=${code}"
    exit "$code"
  fi
  if ((streak >= MAX_CRASH_STREAK)); then
    log_event "event=stop reason=crash_streak streak=${streak} max=${MAX_CRASH_STREAK}"
    exit 0
  fi
  sleep "$sleep_s"
done
