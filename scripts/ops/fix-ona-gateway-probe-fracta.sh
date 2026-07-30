#!/usr/bin/env bash
# Align ONA gateway probe auth with live agent-gateway (OP-BUG-001) and re-probe.
set -euo pipefail

ENVF=/srv/cogentia/secrets/ona.env
# Live gateway on fracta (2026-07) uses AGENT_GATEWAY_TOKEN=sesame (6 chars).
# Keep that in ONA env so probes send the right Bearer.
GW_TOKEN="${ONA_GATEWAY_TOKEN_VALUE:-sesame}"

tmp=$(mktemp)
if [ -r "$ENVF" ]; then
  grep -vE '^(export[[:space:]]+)?AGENT_GATEWAY_TOKEN=' "$ENVF" >"$tmp" || true
  printf 'AGENT_GATEWAY_TOKEN=%s\n' "$GW_TOKEN" >>"$tmp"
  cat "$tmp" >"$ENVF"
elif sudo test -r "$ENVF" 2>/dev/null; then
  sudo grep -vE '^(export[[:space:]]+)?AGENT_GATEWAY_TOKEN=' "$ENVF" >"$tmp" || true
  printf 'AGENT_GATEWAY_TOKEN=%s\n' "$GW_TOKEN" >>"$tmp"
  sudo tee "$ENVF" <"$tmp" >/dev/null
  sudo chmod 600 "$ENVF"
else
  echo "ona.env not found" >&2
  exit 1
fi
rm -f "$tmp"
echo "AGENT_GATEWAY_TOKEN configured for ONA (len=${#GW_TOKEN})"

# Ensure probes.js is current in WorkingDirectory tree
PROBES=/srv/cogentia/repos/operium/lib/probes.js
if [ -f "$PROBES" ]; then
  if ! grep -q 'gatewayAuthHeaders' "$PROBES"; then
    echo "WARNING: probes.js missing gatewayAuthHeaders — deploy lib/probes.js first" >&2
  else
    echo "probes.js has gatewayAuthHeaders"
  fi
fi

sudo systemctl restart operium-node-agent
sleep 3

curl -sS -m 90 -X POST \
  -H 'Authorization: Bearer sesame42' \
  -H 'Content-Type: application/json' \
  -d '{}' \
  http://127.0.0.1:8794/soma/actions/observation.refresh \
  -o /tmp/ona-refresh.json -w 'refresh_http=%{http_code}\n' || true

sleep 1
curl -sS -m 5 http://127.0.0.1:8794/node/status -o /tmp/ona-status.json
python3 - <<'PY'
import json
d = json.load(open("/tmp/ona-status.json"))
print("ok", d.get("ok"), "health", d.get("health_score"), "failed", (d.get("probes") or {}).get("failed_count"))
for p in (d.get("probes") or {}).get("items") or []:
    r = p.get("result") or {}
    print(
        p.get("probe_kind"),
        "ok=", p.get("ok"),
        "skip=", p.get("skipped"),
        "http=", r.get("status"),
        "err=", r.get("error"),
        "svc=", r.get("service"),
    )
assert d.get("ok") is True, "node status still not ok"
print("OP-BUG-001 gateway probe: OK")
PY
