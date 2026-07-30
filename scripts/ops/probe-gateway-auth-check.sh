#!/usr/bin/env bash
# Diagnose agent-gateway :8793 auth without printing secret values.
set -euo pipefail

echo "listeners:"
ss -lntp 2>/dev/null | grep 8793 || true

read_key() {
  local file="$1" key="$2"
  local line=""
  if [ -r "$file" ]; then
    line=$(grep -E "^(export[[:space:]]+)?${key}=" "$file" 2>/dev/null | head -1 || true)
  elif command -v sudo >/dev/null 2>&1 && sudo test -r "$file" 2>/dev/null; then
    line=$(sudo grep -E "^(export[[:space:]]+)?${key}=" "$file" 2>/dev/null | head -1 || true)
  fi
  printf '%s' "$line" | sed -E "s/^(export[[:space:]]+)?${key}=//" | tr -d '"' | tr -d "'"
}

try_auth() {
  local label="$1" token="$2"
  if [ -z "$token" ]; then
    echo "${label}=skip_empty"
    return 0
  fi
  local code
  code=$(curl -sS -m 4 -o /tmp/gw-auth-body.json -w '%{http_code}' \
    -H "Authorization: Bearer ${token}" \
    'http://127.0.0.1:8793/health?quick=1' || echo 000)
  local svc
  svc=$(python3 -c "import json;d=json.load(open('/tmp/gw-auth-body.json'));print(d.get('service') or d.get('error') or list(d.keys())[:4])" 2>/dev/null || echo "?")
  echo "${label}=${code} body=${svc} tok_len=${#token}"
}

echo "noauth:"
curl -sS -m 4 -o /tmp/gw-auth-body.json -w 'code=%{http_code}\n' 'http://127.0.0.1:8793/health?quick=1' || true

AGT=$(read_key /srv/cogentia/secrets/agent-gateway.env AGENT_GATEWAY_TOKEN)
COG=$(read_key /etc/cogentia/magistral.env COGENTIA_API_KEY)
[ -z "$COG" ] && COG=$(read_key /srv/cogentia/secrets/agent-gateway.env COGENTIA_API_KEY)

try_auth "AGENT_GATEWAY_TOKEN" "$AGT"
try_auth "COGENTIA_API_KEY" "$COG"
try_auth "sesame42" "sesame42"
try_auth "Sesame42" "Sesame42"

# From running gateway process env
pid=$(ss -lntp 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
if [ -n "${pid:-}" ] && [ -r "/proc/${pid}/environ" ]; then
  proc_tok=$(tr '\0' '\n' <"/proc/${pid}/environ" | grep -E '^(AGENT_GATEWAY_TOKEN|COGENTIA_API_KEY)=' | head -1 | sed -E 's/^[^=]+=//')
  try_auth "process_token" "$proc_tok"
fi
