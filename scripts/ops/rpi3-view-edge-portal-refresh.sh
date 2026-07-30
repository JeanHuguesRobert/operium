#!/bin/sh
set -eu

PORTAL_DIR="${OPERIUM_EDGE_PORTAL_DIR:-/srv/operium-edge-portal}"
TARGET="$PORTAL_DIR/status.json"
TEMP="$PORTAL_DIR/.status.json.tmp.$$"

probe_host() {
  if ping -c 1 -W 2 "$1" >/dev/null 2>&1; then
    printf true
  else
    printf false
  fi
}

if curl -fsS --max-time 8 \
  https://cogentia.fractavolta.com/api/health >/dev/null 2>&1; then
  VIEWS_STORE=true
else
  VIEWS_STORE=false
fi

FRACTA="$(probe_host fracta)"
WORKSTATION="$(probe_host i7-thinkpad-jhr)"
PHONE="$(probe_host poco-jhr)"
GENERATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

cat >"$TEMP" <<EOF
{
  "schema": "operium.edge-portal.status.v1",
  "generated_at": "$GENERATED_AT",
  "mode": "last-observed",
  "services": {
    "views_store": $VIEWS_STORE
  },
  "nodes": {
    "fracta": $FRACTA,
    "workstation": $WORKSTATION,
    "phone": $PHONE,
    "rpi3_view": true
  }
}
EOF

chmod 0644 "$TEMP"
mv -f "$TEMP" "$TARGET"

# P4: warm last-known zoom packs (direct CGI exec — no self-HTTP)
if [ -x "${HOME}/bin/rpi3-view-warm-node-cache.sh" ]; then
  "${HOME}/bin/rpi3-view-warm-node-cache.sh" || true
elif [ -x "$(dirname "$0")/rpi3-view-warm-node-cache.sh" ]; then
  "$(dirname "$0")/rpi3-view-warm-node-cache.sh" || true
fi
