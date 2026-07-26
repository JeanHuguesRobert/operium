#!/usr/bin/env bash
# Apply Operium Magistral coding-agent map on fracta. Run ON fracta.
# Does not print secret values.
set -euo pipefail

MAP_DEST=/etc/cogentia/magistral-openai-map.json
ENV_DEST=/etc/cogentia/magistral.env

MAP_SRC=""
for c in \
  /srv/cogentia/repos/operium/profiles/magistral-map.coding-agents.v1.json \
  /home/ubuntu/repos/operium/profiles/magistral-map.coding-agents.v1.json
do
  if [[ -f "$c" ]]; then
    MAP_SRC="$c"
    break
  fi
done

if [[ -z "$MAP_SRC" ]]; then
  curl -fsS -m 30 -o /tmp/magistral-map.coding-agents.v1.json \
    https://raw.githubusercontent.com/JeanHuguesRobert/operium/main/profiles/magistral-map.coding-agents.v1.json
  MAP_SRC=/tmp/magistral-map.coding-agents.v1.json
fi

echo "MAP_SRC=$MAP_SRC"
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
token = None
src = None
for p in candidates:
    raw = read_text(p)
    if not raw:
        continue
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k in (
            "AGENT_GATEWAY_TOKEN",
            "AGENT_GATEWAY_INVOKE_TOKEN",
            "AGENT_GATEWAY_ACCEPT_TOKEN",
        ) and v:
            token, src = v, p
            break
    if token:
        break

has = any(l.startswith("AGENT_GATEWAY_TOKEN=") for l in text.splitlines())
if token and not has:
    Path("/tmp/magistral.env.append").write_text(
        "\n# added for coding-agent map\nAGENT_GATEWAY_TOKEN=" + token + "\n"
    )
    print("TOKEN_APPEND from", src, "len", len(token))
elif token and has:
    print("TOKEN_ALREADY_PRESENT len", len(token))
elif has:
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

python3 -c 'import json; m=json.load(open("/etc/cogentia/magistral-openai-map.json")); print("nodes", [n.get("id") for n in m])'

sudo systemctl restart magistral.service
sleep 2
systemctl is-active magistral.service

if [[ -x /srv/cogentia/repos/cogentia/scripts/ops/fracta-guide-stack.sh ]]; then
  sudo bash /srv/cogentia/repos/cogentia/scripts/ops/fracta-guide-stack.sh restart
else
  echo "WARN: fracta-guide-stack.sh missing; restart mcp/cogentia manually if needed"
fi

echo "APPLY_OK"
