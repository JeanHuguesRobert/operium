#!/usr/bin/env bash
# Warm last-known zoom caches on the edge portal host (P4).
# Invokes the node CGI logic indirectly via HTTP only when httpd is free.
# Prefer QUERY_STRING direct exec to avoid busybox single-thread deadlock:
#   QUERY_STRING=host=fracta /srv/operium-edge-portal/cgi-bin/node >/dev/null
set -euo pipefail

PORTAL_DIR="${OPERIUM_EDGE_PORTAL_DIR:-/srv/operium-edge-portal}"
NODE_CGI="${PORTAL_DIR}/cgi-bin/node"
HOSTS="${EDGE_PORTAL_FLEET_HOSTS:-fracta i7-thinkpad-jhr rpi3-view poco-jhr}"

mkdir -p "${PORTAL_DIR}/cache/nodes"

ok=0
fail=0
for host in $HOSTS; do
  out="${PORTAL_DIR}/cache/nodes/.last-warm-${host}.json"
  if [ -x "$NODE_CGI" ]; then
    if QUERY_STRING="host=${host}&warm=1" OPERIUM_EDGE_PORTAL_DIR="$PORTAL_DIR" \
      "$NODE_CGI" >"$out" 2>/dev/null; then
      if grep -q '"ok":true\|"ok": true' "$out" 2>/dev/null; then
        ok=$((ok + 1))
        continue
      fi
    fi
  fi
  fail=$((fail + 1))
done

echo "warm-node-cache ok=${ok} fail=${fail} dir=${PORTAL_DIR}/cache/nodes"
