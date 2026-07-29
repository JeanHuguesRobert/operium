#!/usr/bin/env bash
# Sync Caddy's public mail.fractavolta.com certificate into Stalwart.
# Restarts Stalwart only when the certificate or key changed.
set -euo pipefail

CADDY_CERT_ROOT="${CADDY_CERT_ROOT:-/var/lib/caddy/.local/share/caddy/certificates}"
TLS_DIR="${STALWART_TLS_DIR:-/etc/stalwart/tls}"
DEST_CERT="${TLS_DIR}/mail.fractavolta.com.crt"
DEST_KEY="${TLS_DIR}/mail.fractavolta.com.key"

log(){ echo "[stalwart-cert-sync] $*"; }
die(){ log "ERROR: $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || exec sudo -n bash "$0" "$@"
command -v openssl >/dev/null || die "openssl required"

SOURCE_CERT="$(
  find "$CADDY_CERT_ROOT" -type f \
    -path '*/mail.fractavolta.com/mail.fractavolta.com.crt' \
    -printf '%T@ %p\n' 2>/dev/null |
    sort -nr |
    head -1 |
    cut -d' ' -f2-
)"
[[ -n "$SOURCE_CERT" && -f "$SOURCE_CERT" ]] ||
  die "Caddy certificate for mail.fractavolta.com not found"
SOURCE_KEY="${SOURCE_CERT%.crt}.key"
[[ -f "$SOURCE_KEY" ]] || die "matching Caddy private key not found"

openssl x509 -in "$SOURCE_CERT" -noout -checkend 604800 >/dev/null ||
  die "certificate expires in less than seven days"
openssl x509 -in "$SOURCE_CERT" -noout -ext subjectAltName |
  grep -Fq 'DNS:mail.fractavolta.com' ||
  die "certificate SAN does not contain mail.fractavolta.com"

CERT_PUB="$(openssl x509 -in "$SOURCE_CERT" -pubkey -noout | openssl sha256)"
KEY_PUB="$(openssl pkey -in "$SOURCE_KEY" -pubout 2>/dev/null | openssl sha256)"
[[ "$CERT_PUB" == "$KEY_PUB" ]] || die "certificate and private key do not match"

install -d -m 750 -o root -g stalwart "$TLS_DIR"
CHANGED=0
if [[ ! -f "$DEST_CERT" ]] || ! cmp -s "$SOURCE_CERT" "$DEST_CERT"; then
  install -m 640 -o root -g stalwart "$SOURCE_CERT" "$DEST_CERT"
  CHANGED=1
fi
if [[ ! -f "$DEST_KEY" ]] || ! cmp -s "$SOURCE_KEY" "$DEST_KEY"; then
  install -m 640 -o root -g stalwart "$SOURCE_KEY" "$DEST_KEY"
  CHANGED=1
fi

if [[ "$CHANGED" -eq 1 ]]; then
  systemctl restart stalwart
  systemctl is-active --quiet stalwart ||
    die "stalwart failed after certificate sync"
  log "certificate updated and Stalwart restarted"
else
  log "certificate unchanged"
fi

openssl x509 -in "$DEST_CERT" -noout -subject -issuer -dates
