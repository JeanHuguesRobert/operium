#!/usr/bin/env bash
# Restore Stalwart from an encrypted backup produced by stalwart-backup.sh.
# Usage: sudo stalwart-restore.sh /var/backups/stalwart/stalwart-YYYYMMDD….tar.enc
# Never prints secret values.
set -euo pipefail

KEY_FILE="${STALWART_BACKUP_KEY:-/srv/cogentia/secrets/stalwart-backup.key}"
SECRETS_DEST="${STALWART_SECRETS_FILE:-/srv/cogentia/secrets/stalwart-phase1.env}"
ENC="${1:-}"

log() { echo "[stalwart-restore] $*"; }
die() { log "ERROR: $*"; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "must run as root"
[[ -n "$ENC" && -f "$ENC" ]] || die "usage: $0 /path/to/stalwart-*.tar.enc"
[[ -f "$KEY_FILE" ]] || die "missing key $KEY_FILE"

if [[ -f "${ENC}.sha256" ]]; then
  log "verifying checksum"
  (cd "$(dirname "$ENC")" && sha256sum -c "$(basename "${ENC}").sha256")
fi

WORKDIR="$(mktemp -d /tmp/stalwart-restore.XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT

log "decrypting (quiet)"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "$ENC" -out "${WORKDIR}/bundle.tar" \
  -pass "file:${KEY_FILE}"

tar -C "$WORKDIR" -xf "${WORKDIR}/bundle.tar"
[[ -f "${WORKDIR}/MANIFEST.txt" ]] || die "missing MANIFEST in archive"
log "manifest:"
cat "${WORKDIR}/MANIFEST.txt"

log "stopping stalwart"
systemctl stop stalwart || true

# Pre-restore snapshot of current state (unencrypted local only under /root)
SNAP="/root/restore-pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$SNAP"
[[ -d /var/lib/stalwart ]] && tar -C / -czf "${SNAP}/var-lib-stalwart.tgz" var/lib/stalwart || true
[[ -d /etc/stalwart ]] && tar -C / -czf "${SNAP}/etc-stalwart.tgz" etc/stalwart || true
log "pre-restore snap $SNAP"

log "restoring data and config"
if [[ -f "${WORKDIR}/payload/var-lib-stalwart.tar" ]]; then
  tar -C / -xf "${WORKDIR}/payload/var-lib-stalwart.tar"
  chown -R stalwart:stalwart /var/lib/stalwart
  chmod 750 /var/lib/stalwart
fi
if [[ -f "${WORKDIR}/payload/etc-stalwart.tar" ]]; then
  tar -C / -xf "${WORKDIR}/payload/etc-stalwart.tar"
  chown -R root:stalwart /etc/stalwart 2>/dev/null || true
  chmod 750 /etc/stalwart
  [[ -f /etc/stalwart/config.json ]] && chmod 640 /etc/stalwart/config.json
  [[ -f /etc/stalwart/stalwart.env ]] && chmod 640 /etc/stalwart/stalwart.env
fi
if [[ -f "${WORKDIR}/payload/stalwart-phase1.env" ]]; then
  install -d -m 700 -o root -g root "$(dirname "$SECRETS_DEST")"
  install -m 600 -o root -g root "${WORKDIR}/payload/stalwart-phase1.env" "$SECRETS_DEST"
  log "secrets restored to ${SECRETS_DEST} (mode 600)"
fi

log "starting stalwart"
systemctl start stalwart
sleep 3
systemctl is-active --quiet stalwart || die "stalwart not active after restore"
log "OK restore complete"
