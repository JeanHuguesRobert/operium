#!/usr/bin/env bash
# Ensure rpi3-view ona.env has mesh bind + identity + Mariani location/contact.
set -euo pipefail
ENVF="${1:-$HOME/srv/cogentia/secrets/ona.env}"

ensure_kv() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENVF" 2>/dev/null; then
    # leave existing (including location/contact)
    return 0
  fi
  printf '%s=%s\n' "$key" "$val" >>"$ENVF"
}

# Identity / mesh (required for fleet)
ensure_kv ONA_ENABLED 1
ensure_kv ONA_BIND 0.0.0.0
ensure_kv ONA_PORT 8794
ensure_kv ONA_HOSTNAME rpi3-view
ensure_kv ONA_NODE_ID 'resource://rpi3-view'
ensure_kv ONA_HEALTH_PUBLIC 1
ensure_kv ONA_MESH_OPEN_READ 1
ensure_kv ONA_JOBS 0

# Location / contact (quoted for shell source)
if grep -q '^ONA_LOCATION=' "$ENVF"; then
  sed -i 's|^ONA_LOCATION=.*|ONA_LOCATION="Institut Mariani, 1 cours Paoli, F-2050 Corte"|' "$ENVF"
else
  printf 'ONA_LOCATION="%s"\n' 'Institut Mariani, 1 cours Paoli, F-2050 Corte' >>"$ENVF"
fi
if grep -q '^ONA_CONTACT=' "$ENVF"; then
  sed -i 's|^ONA_CONTACT=.*|ONA_CONTACT="jhr@baronsmariani.org"|' "$ENVF"
else
  printf 'ONA_CONTACT="%s"\n' 'jhr@baronsmariani.org' >>"$ENVF"
fi

echo "non-secret keys:"
grep -E '^(ONA_ENABLED|ONA_BIND|ONA_PORT|ONA_HOSTNAME|ONA_NODE_ID|ONA_HEALTH_PUBLIC|ONA_MESH_OPEN_READ|ONA_JOBS|ONA_LOCATION|ONA_CONTACT)=' "$ENVF" || true
