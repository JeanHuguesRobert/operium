#!/usr/bin/env bash
# Apply Operium Magistral coding-agent map on fracta. Run ON fracta.
# Does not print secret values.
#
# Usage:
#   bash scripts/ops/apply-magistral-coding-map-fracta.sh
#   bash scripts/ops/apply-magistral-coding-map-fracta.sh --dry-run
#   bash scripts/ops/apply-magistral-coding-map-fracta.sh --skip-restart
set -euo pipefail

MAP_DEST=/etc/cogentia/magistral-openai-map.json
ENV_DEST=/etc/cogentia/magistral.env
DRY_RUN=0
SKIP_RESTART=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --skip-restart) SKIP_RESTART=1 ;;
    -h|--help)
      echo "usage: $0 [--dry-run] [--skip-restart]"
      exit 0
      ;;
    *)
      echo "unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

MAP_SRC=""
OPERIUM_ROOT=""
for c in \
  /srv/cogentia/repos/operium/profiles/magistral-map.coding-agents.v1.json \
  /home/ubuntu/repos/operium/profiles/magistral-map.coding-agents.v1.json
do
  if [[ -f "$c" ]]; then
    MAP_SRC="$c"
    OPERIUM_ROOT="$(cd "$(dirname "$c")/.." && pwd)"
    break
  fi
done

if [[ -z "$MAP_SRC" ]]; then
  curl -fsS -m 30 -o /tmp/magistral-map.coding-agents.v1.json \
    https://raw.githubusercontent.com/JeanHuguesRobert/operium/main/profiles/magistral-map.coding-agents.v1.json
  MAP_SRC=/tmp/magistral-map.coding-agents.v1.json
fi

echo "MAP_SRC=$MAP_SRC"
echo "DRY_RUN=$DRY_RUN"

if [[ "$DRY_RUN" -eq 1 ]]; then
  python3 - <<PY
import json
from pathlib import Path
src = Path("$MAP_SRC")
m = json.loads(src.read_text())
print("would_install_nodes", [n.get("id") for n in m])
print("would_fast", [n.get("id") for n in m if n.get("tier") == "fast"])
print("would_fallback", [n.get("id") for n in m if n.get("tier") == "fallback"])
live = Path("$MAP_DEST")
if live.is_file():
    try:
        cur = json.loads(live.read_text())
    except PermissionError:
        import subprocess
        cur = json.loads(subprocess.check_output(["sudo", "cat", str(live)], text=True))
    print("current_nodes", [n.get("id") for n in cur])
    print("current_fast", [n.get("id") for n in cur if n.get("tier") == "fast"])
else:
    print("current_map", "missing")
print("DRY_RUN_OK")
PY
  exit 0
fi

if [[ -f "$MAP_DEST" ]]; then
  sudo cp -a "$MAP_DEST" "${MAP_DEST}.bak.$(date -u +%Y%m%dT%H%M%SZ)"
fi
sudo cp "$MAP_SRC" "$MAP_DEST"
sudo chown root:ubuntu "$MAP_DEST"
sudo chmod 640 "$MAP_DEST"

sudo python3 <<'PY'
from pathlib import Path
import subprocess

def read_text(path: str) -> str:
    try:
        return Path(path).read_text()
    except PermissionError:
        return subprocess.check_output(["sudo", "cat", path], text=True)
    except Exception:
        return ""

env_path = "/etc/cogentia/magistral.env"
text = read_text(env_path)
# Authority first: inseme/.env; other files are copies (override only with comment).
candidates = [
    "/srv/cogentia/repos/inseme/.env",
    "/home/ubuntu/repos/inseme/.env",
    "/etc/cogentia/agent-gateway.env",
    "/srv/cogentia/secrets/agent-gateway.env",
    "/srv/cogentia/secrets/guide.env",
]
def pick_token(raw: str):
    """Prefer COGENTIA_API_KEY over legacy AGENT_GATEWAY_* names."""
    found = {}
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k in (
            "COGENTIA_API_KEY",
            "AGENT_GATEWAY_TOKEN",
            "AGENT_GATEWAY_INVOKE_TOKEN",
            "AGENT_GATEWAY_ACCEPT_TOKEN",
        ) and v:
            found[k] = v
    if "COGENTIA_API_KEY" in found:
        return found["COGENTIA_API_KEY"]
    for k in (
        "AGENT_GATEWAY_TOKEN",
        "AGENT_GATEWAY_INVOKE_TOKEN",
        "AGENT_GATEWAY_ACCEPT_TOKEN",
    ):
        if k in found:
            return found[k]
    return None

token = None
src = None
for p in candidates:
    raw = read_text(p)
    if not raw:
        continue
    t = pick_token(raw)
    if t:
        token, src = t, p
        break

has_cogentia = any(l.startswith("COGENTIA_API_KEY=") for l in text.splitlines())
has_legacy = any(l.startswith("AGENT_GATEWAY_TOKEN=") for l in text.splitlines())
if token and not has_cogentia:
    Path("/tmp/magistral.env.append").write_text(
        "\n# Authority: inseme/.env — Cogentia system bearer (not FractaVolta-specific)\n"
        "COGENTIA_API_KEY=" + token + "\n"
    )
    print("TOKEN_APPEND COGENTIA_API_KEY from", src, "len", len(token))
elif token and (has_cogentia or has_legacy):
    print("TOKEN_ALREADY_PRESENT len", len(token))
elif has_cogentia or has_legacy:
    print("TOKEN_ALREADY_PRESENT no_refresh")
else:
    print("TOKEN_MISSING")
    raise SystemExit(2)
PY

if [[ -f /tmp/magistral.env.append ]]; then
  sudo bash -c 'cat /tmp/magistral.env.append >> /etc/cogentia/magistral.env'
  rm -f /tmp/magistral.env.append
  sudo chown root:ubuntu "$ENV_DEST"
  sudo chmod 640 "$ENV_DEST"
fi

python3 -c 'import json; m=json.load(open("/etc/cogentia/magistral-openai-map.json")); print("nodes", [n.get("id") for n in m]); print("fast", [n.get("id") for n in m if n.get("tier")=="fast"]); print("fallback", [n.get("id") for n in m if n.get("tier")=="fallback"])'

if [[ "$SKIP_RESTART" -eq 0 ]]; then
  sudo systemctl restart magistral.service
  sleep 2
  systemctl is-active magistral.service

  if [[ -x /srv/cogentia/repos/cogentia/scripts/ops/fracta-guide-stack.sh ]]; then
    sudo bash /srv/cogentia/repos/cogentia/scripts/ops/fracta-guide-stack.sh restart
  else
    echo "WARN: fracta-guide-stack.sh missing; restart mcp/cogentia manually if needed"
  fi
else
  echo "SKIP_RESTART=1"
fi

# Structural verify against installed map (profile copy when OPERIUM_ROOT known)
if command -v node >/dev/null 2>&1 && [[ -n "${OPERIUM_ROOT:-}" && -f "$OPERIUM_ROOT/scripts/ops/verify-magistral-coding-map.js" ]]; then
  echo "VERIFY_MAP"
  # Copy live map to readable temp for non-root node if needed
  TMP_LIVE=$(mktemp)
  sudo cat "$MAP_DEST" >"$TMP_LIVE"
  if node "$OPERIUM_ROOT/scripts/ops/verify-magistral-coding-map.js" \
    --live "$TMP_LIVE" \
    --expect-profile "$OPERIUM_ROOT/profiles/magistral-map.coding-agents.v1.json" \
    --human; then
    echo "VERIFY_OK"
  else
    rm -f "$TMP_LIVE"
    echo "VERIFY_FAILED" >&2
    exit 1
  fi
  rm -f "$TMP_LIVE"
else
  echo "VERIFY_SKIPPED (node or operium verify script unavailable)"
fi

echo "APPLY_OK"
