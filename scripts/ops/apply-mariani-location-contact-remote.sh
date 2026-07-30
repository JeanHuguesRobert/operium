#!/usr/bin/env bash
# Apply Institut Mariani location/contact to local ona.env and restart ONA.
set -euo pipefail

LOC="Institut Mariani, 1 cours Paoli, F-20250 Corte"
CONTACT="jhr@baronsmariani.org"

find_env() {
  for c in \
    /srv/cogentia/secrets/ona.env \
    "${HOME}/srv/cogentia/secrets/ona.env" \
    "${HOME}/.cogentia/secrets/ona.env"
  do
    if [ -f "$c" ] || sudo test -f "$c" 2>/dev/null; then
      printf '%s\n' "$c"
      return 0
    fi
  done
  return 1
}

ENVF="$(find_env)" || { echo "ona.env not found" >&2; exit 1; }
echo "using $ENVF"

write_keys() {
  local tmp
  tmp="$(mktemp)"
  if [ -r "$ENVF" ]; then
    grep -vE '^(ONA_LOCATION|ONA_CONTACT|ONA_SYS_LOCATION|ONA_SYS_CONTACT)=' "$ENVF" >"$tmp" || true
  else
    sudo grep -vE '^(ONA_LOCATION|ONA_CONTACT|ONA_SYS_LOCATION|ONA_SYS_CONTACT)=' "$ENVF" >"$tmp" || true
  fi
  # Quote values so `source ona.env` is safe (spaces/commas). systemd EnvironmentFile accepts quotes.
  printf 'ONA_LOCATION="%s"\nONA_CONTACT="%s"\n' "$LOC" "$CONTACT" >>"$tmp"
  if [ -w "$ENVF" ]; then
    cat "$tmp" >"$ENVF"
    chmod 600 "$ENVF" 2>/dev/null || true
  else
    sudo tee "$ENVF" <"$tmp" >/dev/null
    sudo chmod 600 "$ENVF" || true
  fi
  rm -f "$tmp"
}

write_keys

kill_ona() {
  # Avoid pkill -f (matches our own cmdline wrappers). Kill by /proc cmdline scan.
  for pid in $(ps -eo pid= 2>/dev/null || true); do
    cmd=$(tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null || true)
    case "$cmd" in
      *operium-node-agent.js*) kill "$pid" 2>/dev/null || true ;;
    esac
  done
  sleep 1
}

if command -v systemctl >/dev/null 2>&1 && systemctl cat operium-node-agent >/dev/null 2>&1; then
  sudo systemctl daemon-reload || true
  sudo systemctl restart operium-node-agent
  sleep 2
elif [ -d "${HOME}/srv/operium-runtime/current" ]; then
  # rpi3-view style
  kill_ona
  set -a
  # shellcheck disable=SC1090
  . "$ENVF"
  set +a
  cd "${HOME}/srv/operium-runtime/current"
  nohup "${HOME}/.local/bin/node" bin/operium-node-agent.js \
    >>"${HOME}/srv/cogentia/logs/operium-node-agent.log" 2>&1 &
  sleep 3
else
  # termux / generic
  kill_ona
  set -a
  # shellcheck disable=SC1090
  . "$ENVF"
  set +a
  ROOT="${OPERIUM_ROOT:-${HOME}/srv/cogentia/repos/operium}"
  cd "$ROOT"
  mkdir -p "${HOME}/srv/cogentia/logs"
  nohup node bin/operium-node-agent.js \
    >>"${HOME}/srv/cogentia/logs/operium-node-agent.log" 2>&1 &
  sleep 3
fi

curl -fsS --max-time 8 http://127.0.0.1:8794/soma/object -o /tmp/soma-object-check.json
python3 - <<'PY'
import json
a = json.load(open("/tmp/soma-object-check.json"))["attributes"]
print("core.location =", a.get("core.location"))
print("core.contact  =", a.get("core.contact"))
assert a.get("core.location"), "missing core.location"
assert a.get("core.contact"), "missing core.contact"
print("OK")
PY
