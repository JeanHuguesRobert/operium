#!/usr/bin/env bash
set -euo pipefail
ENVF="${1:-$HOME/srv/cogentia/secrets/ona.env}"
ROOT="${2:-$HOME/srv/operium-runtime/current}"
NODE_BIN="${3:-$HOME/.local/bin/node}"
LOG="${4:-$HOME/srv/cogentia/logs/operium-node-agent.log}"

# Kill existing ONA processes carefully
while IFS= read -r line; do
  pid="${line%% *}"
  cmd="${line#* }"
  case "$cmd" in
    *operium-node-agent.js*) kill "$pid" 2>/dev/null || true ;;
  esac
done < <(ps -eo pid=,args= 2>/dev/null || true)
sleep 2

set -a
# shellcheck disable=SC1090
. "$ENVF"
set +a

echo "ONA_LOCATION=${ONA_LOCATION:-}"
echo "ONA_CONTACT=${ONA_CONTACT:-}"

cd "$ROOT"
mkdir -p "$(dirname "$LOG")"
nohup "$NODE_BIN" bin/operium-node-agent.js >>"$LOG" 2>&1 &
echo "started pid=$!"
sleep 3

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
