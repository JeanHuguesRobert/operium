#!/usr/bin/env bash
# Encrypted backup of Stalwart data + config + secrets on fracta.
# Never prints secret material. Run as root (systemd timer or sudo).
set -euo pipefail

BACKUP_ROOT="${STALWART_BACKUP_ROOT:-/var/backups/stalwart}"
KEY_FILE="${STALWART_BACKUP_KEY:-/srv/cogentia/secrets/stalwart-backup.key}"
SECRETS_FILE="${STALWART_SECRETS_FILE:-/srv/cogentia/secrets/stalwart-phase1.env}"
DATA_DIR="/var/lib/stalwart"
CONF_DIR="/etc/stalwart"
KEEP_DAYS="${STALWART_BACKUP_KEEP_DAYS:-14}"
DISK_MIN_AVAIL_PCT="${STALWART_BACKUP_MIN_AVAIL_PCT:-15}"
LOG_TAG="stalwart-backup"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
WORKDIR=""
STOP_SERVICE="${STALWART_BACKUP_STOP_SERVICE:-1}"

log() { logger -t "$LOG_TAG" -- "$*"; echo "[$LOG_TAG] $*"; }
die() { log "ERROR: $*"; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "must run as root"

# Disk guard (fail if free space on / is below threshold)
avail_pct=$(df -P / | awk 'NR==2 {printf "%d", ($4*100)/$2}')
used_pct=$(df -P / | awk 'NR==2 {print $5}' | tr -d '%')
log "disk / used=${used_pct}% free_blocks_pct≈${avail_pct}%"
if [[ "$avail_pct" -lt "$DISK_MIN_AVAIL_PCT" ]]; then
  die "insufficient free space on / (need >= ${DISK_MIN_AVAIL_PCT}% free by block estimate)"
fi

# Ensure key (AES-256 key material, 32 bytes hex)
if [[ ! -f "$KEY_FILE" ]]; then
  log "generating backup key at $KEY_FILE"
  install -d -m 700 -o root -g root "$(dirname "$KEY_FILE")"
  openssl rand -hex 32 >"$KEY_FILE"
  chmod 600 "$KEY_FILE"
  chown root:root "$KEY_FILE"
fi
[[ -f "$KEY_FILE" ]] || die "missing key $KEY_FILE"
chmod 600 "$KEY_FILE"

install -d -m 700 -o root -g root "$BACKUP_ROOT"
WORKDIR="$(mktemp -d /tmp/stalwart-backup.XXXXXX)"
cleanup() {
  if [[ -n "$WORKDIR" && -d "$WORKDIR" ]]; then
    rm -rf "$WORKDIR"
  fi
  if [[ "${SERVICE_STOPPED:-0}" -eq 1 ]]; then
    systemctl start stalwart || log "WARN: failed to restart stalwart after backup"
  fi
}
trap cleanup EXIT

SERVICE_STOPPED=0
if [[ "$STOP_SERVICE" == "1" ]] && systemctl is-active --quiet stalwart; then
  log "stopping stalwart for consistent snapshot"
  systemctl stop stalwart
  SERVICE_STOPPED=1
  sleep 1
fi

# Manifest (no secrets)
{
  echo "backup_ts=${TS}"
  echo "hostname=$(hostname -f 2>/dev/null || hostname)"
  echo "stalwart_version=$(/usr/local/bin/stalwart --version 2>/dev/null || echo unknown)"
  echo "data_dir=${DATA_DIR}"
  echo "conf_dir=${CONF_DIR}"
  echo "secrets_included=$([[ -f $SECRETS_FILE ]] && echo yes || echo no)"
  echo "disk_used_pct=${used_pct}"
  du -sh "$DATA_DIR" "$CONF_DIR" 2>/dev/null || true
} >"${WORKDIR}/MANIFEST.txt"

# Stage files
mkdir -p "${WORKDIR}/payload"
if [[ -d "$DATA_DIR" ]]; then
  tar -C / -cf "${WORKDIR}/payload/var-lib-stalwart.tar" var/lib/stalwart
fi
if [[ -d "$CONF_DIR" ]]; then
  tar -C / -cf "${WORKDIR}/payload/etc-stalwart.tar" etc/stalwart
fi
if [[ -f "$SECRETS_FILE" ]]; then
  # path relative staging without echoing contents
  install -m 600 -o root -g root "$SECRETS_FILE" "${WORKDIR}/payload/stalwart-phase1.env"
fi
# Caddy fragment reference (public config)
if [[ -f /etc/caddy/Caddyfile ]]; then
  cp -a /etc/caddy/Caddyfile "${WORKDIR}/payload/Caddyfile"
fi

tar -C "$WORKDIR" -cf "${WORKDIR}/bundle.tar" MANIFEST.txt payload
OUT="${BACKUP_ROOT}/stalwart-${TS}.tar.enc"
# Encrypt with keyfile (PBKDF2). Key is random hex; use as passphrase file.
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
  -in "${WORKDIR}/bundle.tar" \
  -out "$OUT" \
  -pass "file:${KEY_FILE}"
chmod 600 "$OUT"
chown root:root "$OUT"
# GNU sha256sum -c expects "HASH  filename" (two spaces or space-star)
(
  cd "$(dirname "$OUT")"
  sha256sum "$(basename "$OUT")"
) >"${OUT}.sha256"
chmod 600 "${OUT}.sha256"

SIZE=$(stat -c%s "$OUT")
log "wrote $OUT bytes=${SIZE}"

# Retention
find "$BACKUP_ROOT" -maxdepth 1 -type f -name 'stalwart-*.tar.enc' -mtime "+${KEEP_DAYS}" -print -delete 2>/dev/null || true
find "$BACKUP_ROOT" -maxdepth 1 -type f -name 'stalwart-*.tar.enc.sha256' -mtime "+${KEEP_DAYS}" -delete 2>/dev/null || true

# Restart handled by trap
log "backup complete keep_days=${KEEP_DAYS}"
echo "OK backup=${OUT}"
