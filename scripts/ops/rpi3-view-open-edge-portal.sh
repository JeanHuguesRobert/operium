#!/usr/bin/env bash
# Wait for the local edge portal, then open it in Firefox without session-restore UI.
# Used from labwc autostart. Hard reboot must not block on "Restore session?".
set -u

PORTAL_URL="${PORTAL_URL:-http://127.0.0.1/}"
BROWSER="${BROWSER:-}"
MAX_WAIT_SEC="${MAX_WAIT_SEC:-90}"
FF_PROFILE_NAME="${FF_PROFILE_NAME:-operium-edge}"
LOG="${HOME}/.cogentia/var/edge-portal-open.log"
USER_JS_SRC="${USER_JS_SRC:-}"

mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
log() { echo "$@" >>"$LOG" 2>/dev/null || true; }

log "---- $(date -Is) open edge portal ----"
log "url=$PORTAL_URL max_wait=${MAX_WAIT_SEC}s profile=$FF_PROFILE_NAME"

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
    log "no browser found"
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

# --- Firefox dedicated profile (no restore dialog after brutal reboot) ---
ensure_firefox_profile() {
  case "$BROWSER" in
    *firefox*) ;;
    *) return 0 ;;
  esac

  local ff_home profiles_ini prof_path abs_path
  ff_home="${HOME}/.mozilla/firefox"
  profiles_ini="${ff_home}/profiles.ini"
  mkdir -p "$ff_home"

  if [ ! -f "$profiles_ini" ]; then
    cat >"$profiles_ini" <<EOF
[General]
StartWithLastProfile=0
Version=2
EOF
  fi

  if ! grep -q "Name=${FF_PROFILE_NAME}" "$profiles_ini" 2>/dev/null; then
    log "creating Firefox profile ${FF_PROFILE_NAME}"
    # Create empty profile dir + register (do not touch default-esr browsing profile)
    prof_path="${FF_PROFILE_NAME}.profile"
    mkdir -p "${ff_home}/${prof_path}"
    {
      echo ""
      echo "[Profile$(date +%s)]"
      echo "Name=${FF_PROFILE_NAME}"
      echo "IsRelative=1"
      echo "Path=${prof_path}"
    } >>"$profiles_ini"
  fi

  # Resolve profile directory
  abs_path="$(awk -v n="$FF_PROFILE_NAME" '
    $0 ~ /^\[Profile/ { blk=1; name=""; path="" }
    blk && $0 ~ /^Name=/ { name=substr($0,6) }
    blk && $0 ~ /^Path=/ { path=substr($0,6) }
    blk && name==n && path!="" { print path; exit }
  ' "$profiles_ini")"
  if [ -z "$abs_path" ]; then
    abs_path="${FF_PROFILE_NAME}.profile"
    mkdir -p "${ff_home}/${abs_path}"
  fi
  case "$abs_path" in
    /*) ;;
    *) abs_path="${ff_home}/${abs_path}" ;;
  esac
  mkdir -p "$abs_path"

  # Install / refresh user.js prefs
  if [ -z "$USER_JS_SRC" ]; then
    for c in \
      "$(dirname "$0")/../templates/rpi3-view/firefox-edge-portal-user.js" \
      "${HOME}/bin/firefox-edge-portal-user.js" \
      "${HOME}/firefox-edge-portal-user.js"
    do
      if [ -f "$c" ]; then USER_JS_SRC="$c"; break; fi
    done
  fi
  if [ -n "$USER_JS_SRC" ] && [ -f "$USER_JS_SRC" ]; then
    cp -f "$USER_JS_SRC" "${abs_path}/user.js"
    log "user.js from $USER_JS_SRC"
  else
    # Inline minimal prefs if template missing
    cat >"${abs_path}/user.js" <<'EOF'
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.sessionstore.resume_session_once", false);
user_pref("browser.sessionstore.max_resumed_crashes", 0);
user_pref("toolkit.startup.max_resumed_crashes", -1);
user_pref("browser.startup.page", 0);
user_pref("browser.startup.homepage", "http://127.0.0.1/");
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.tabs.warnOnClose", false);
user_pref("browser.warnOnQuit", false);
EOF
    log "user.js written inline"
  fi

  # Drop any leftover session state from a previous hard kill (belt and suspenders).
  rm -f "${abs_path}/sessionstore.jsonlz4" \
        "${abs_path}/sessionCheckpoints.json" 2>/dev/null || true
  rm -rf "${abs_path}/sessionstore-backups" 2>/dev/null || true
  mkdir -p "${abs_path}/sessionstore-backups"
  # Clear "this is embarrassing" / upgrade dialogs markers if present
  rm -f "${abs_path}/.parentlock" "${abs_path}/lock" "${abs_path}/.parentlock.*" 2>/dev/null || true

  log "profile dir=$abs_path"
  FF_PROFILE_DIR="$abs_path"
}

ensure_firefox_profile

ready=0
i=0
while [ "$i" -lt "$MAX_WAIT_SEC" ]; do
  if curl -fsS --max-time 2 -o /dev/null "$PORTAL_URL" 2>/dev/null; then
    ready=1
    break
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$ready" != "1" ]; then
  log "portal not ready after ${MAX_WAIT_SEC}s — opening anyway"
else
  log "portal ready after ${i}s"
fi

# Launch: dedicated profile, no remote (avoids attaching to a half-dead default session).
FF_ARGS=()
case "$BROWSER" in
  *firefox*)
    FF_ARGS+=(-P "$FF_PROFILE_NAME" --no-remote)
    ;;
esac

if [ "${KIOSK_MODE:-window}" = "kiosk" ]; then
  log "exec $BROWSER ${FF_ARGS[*]} --kiosk $PORTAL_URL"
  exec "$BROWSER" "${FF_ARGS[@]}" --kiosk "$PORTAL_URL"
else
  log "exec $BROWSER ${FF_ARGS[*]} --new-window $PORTAL_URL"
  exec "$BROWSER" "${FF_ARGS[@]}" --new-window "$PORTAL_URL"
fi
