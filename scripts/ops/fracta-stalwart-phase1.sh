#!/usr/bin/env bash
# Phase 1 — private Stalwart install on fracta (Operium-owned ops).
# Run on the VPS as ubuntu with passwordless sudo.
# Never echo secrets to stdout.

set -euo pipefail

FQDN_HOST="${STALWART_FQDN:-mail.fractavolta.com}"
MAIL_DOMAIN="${STALWART_DOMAIN:-mail.fractavolta.com}"
PUBLIC_URL="https://${FQDN_HOST}"
DATA_DIR="/var/lib/stalwart"
SECRETS_DIR="/srv/cogentia/secrets"
SECRETS_FILE="${SECRETS_DIR}/stalwart-phase1.env"
RESTORE_ROOT="/root/restore-pre-stalwart"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
RESTORE="${RESTORE_ROOT}-${TS}"
LOG="/tmp/stalwart-phase1-${TS}.log"

log() { echo "[phase1 $(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }
die() { log "ERROR: $*"; exit 1; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "missing command: $1"; }

rand_secret() {
  # 32 bytes base64url-ish alphanumeric
  openssl rand -base64 36 | tr -d '/+=' | head -c 32
}

# --- 0. preflight ---
log "preflight FQDN=${FQDN_HOST} domain=${MAIL_DOMAIN}"
require_cmd curl
require_cmd openssl
require_cmd dig
require_cmd systemctl
sudo -n true || die "sudo -n required"

if systemctl is-active --quiet stalwart 2>/dev/null; then
  die "stalwart already active — abort to avoid double install"
fi
if [[ -x /usr/local/bin/stalwart ]] || [[ -d /etc/stalwart ]]; then
  die "stalwart files already present — abort"
fi

# --- 1. restore point ---
log "restore point -> ${RESTORE}"
sudo mkdir -p "$RESTORE"
sudo cp -a /etc/caddy/Caddyfile "$RESTORE/" 2>/dev/null || true
sudo sh -c "iptables-save > '${RESTORE}/iptables.v4.save'" || true
systemctl list-units --type=service --state=running --no-pager >"/tmp/svc-run.txt"
sudo cp /tmp/svc-run.txt "${RESTORE}/services-running.txt"
free -h | sudo tee "${RESTORE}/mem.txt" >/dev/null
ss -tulpn | sudo tee "${RESTORE}/ss.txt" >/dev/null
df -h | sudo tee "${RESTORE}/df.txt" >/dev/null
hostname -f | sudo tee "${RESTORE}/hostname.txt" >/dev/null
log "restore point ready"

# --- 2. data directory (pre-create; installer also uses /var/lib/stalwart) ---
log "prepare data dir ${DATA_DIR}"
sudo mkdir -p "$DATA_DIR"
sudo chmod 750 "$DATA_DIR"

# --- 3. secrets (generate before install; never print values) ---
log "generate secrets file (root-only path)"
sudo mkdir -p "$SECRETS_DIR"
if [[ -f "$SECRETS_FILE" ]]; then
  die "secrets file already exists: ${SECRETS_FILE}"
fi

RECOVERY_PASS="$(rand_secret)"
ADMIN_PASS="$(rand_secret)"
ARCHIVE_PASS="$(rand_secret)"
AGENT_PASS="$(rand_secret)"

# Write secrets on host with root-only perms; do not cat the file later in this log
sudo install -m 600 -o root -g root /dev/null "$SECRETS_FILE"
sudo bash -c "cat > '${SECRETS_FILE}'" <<EOF
# Stalwart phase-1 secrets — root-only. Generated ${TS}
# Paths only may be referenced from git/docs.
STALWART_FQDN=${FQDN_HOST}
STALWART_DOMAIN=${MAIL_DOMAIN}
STALWART_PUBLIC_URL=${PUBLIC_URL}
# Recovery admin for bootstrap/recovery (username:password)
STALWART_RECOVERY_ADMIN=admin:${RECOVERY_PASS}
# Permanent test accounts (local-part@domain)
STALWART_ADMIN_USER=jhn
STALWART_ADMIN_PASSWORD=${ADMIN_PASS}
STALWART_ARCHIVE_USER=archive
STALWART_ARCHIVE_PASSWORD=${ARCHIVE_PASS}
STALWART_AGENT_USER=agent-test
STALWART_AGENT_PASSWORD=${AGENT_PASS}
EOF
sudo chmod 600 "$SECRETS_FILE"
sudo chown root:root "$SECRETS_FILE"
# keep recovery password only in memory variables for install; clear file path logged
log "secrets written (mode 600 owner root) path=${SECRETS_FILE}"

# --- 4. official install ---
log "download official install.sh"
cd /tmp
curl --proto '=https' --tlsv1.2 -sSf https://get.stalw.art/install.sh -o install-stalwart.sh
# sanity: non-empty shell script
[[ -s install-stalwart.sh ]] || die "empty install script"
head -1 install-stalwart.sh | grep -qE 'bash|sh' || log "warn: install script shebang unexpected"

# Pre-seed env so bootstrap uses pinned recovery admin (no password printed to journal)
sudo mkdir -p /etc/stalwart
sudo install -m 600 -o root -g root /dev/null /etc/stalwart/stalwart.env
sudo bash -c "cat > /etc/stalwart/stalwart.env" <<EOF
STALWART_RECOVERY_ADMIN=admin:${RECOVERY_PASS}
STALWART_PUBLIC_URL=${PUBLIC_URL}
EOF
sudo chmod 600 /etc/stalwart/stalwart.env

log "run official installer (may start service)"
# Installer typically overwrites paths; we re-apply env after if needed
sudo sh /tmp/install-stalwart.sh 2>&1 | tee -a "$LOG" | sed -E 's/(password:).*/\1 [REDACTED]/gi' || {
  log "installer exit non-zero — inspect ${LOG}"
}

# Ensure env file still has our values (installer may have created a template)
if ! sudo grep -q '^STALWART_RECOVERY_ADMIN=' /etc/stalwart/stalwart.env 2>/dev/null; then
  sudo bash -c "cat > /etc/stalwart/stalwart.env" <<EOF
STALWART_RECOVERY_ADMIN=admin:${RECOVERY_PASS}
STALWART_PUBLIC_URL=${PUBLIC_URL}
EOF
  sudo chmod 600 /etc/stalwart/stalwart.env
else
  # merge PUBLIC_URL if missing
  if ! sudo grep -q '^STALWART_PUBLIC_URL=' /etc/stalwart/stalwart.env; then
    echo "STALWART_PUBLIC_URL=${PUBLIC_URL}" | sudo tee -a /etc/stalwart/stalwart.env >/dev/null
  fi
fi

# Ensure systemd unit loads EnvironmentFile
if systemctl cat stalwart >/dev/null 2>&1; then
  if ! systemctl show stalwart -p EnvironmentFiles --value 2>/dev/null | grep -q stalwart.env; then
    log "add EnvironmentFile drop-in"
    sudo mkdir -p /etc/systemd/system/stalwart.service.d
    sudo tee /etc/systemd/system/stalwart.service.d/env.conf >/dev/null <<'UNIT'
[Service]
EnvironmentFile=-/etc/stalwart/stalwart.env
UNIT
    sudo systemctl daemon-reload
  fi
fi

# --- 5. lock HTTP bootstrap to localhost only ASAP ---
# After install, default may bind 0.0.0.0:8080 — block public with iptables if listening publicly
lock_public_ports() {
  log "firewall: ensure SMTP 25 and admin 8080 not publicly accepted"
  # Do not open 25. Explicitly reject new public 25 if somehow accepted later — host default already REJECT.
  # Bind-check and if 8080 on all interfaces, add REJECT for non-local if needed
  if ss -tln | grep -qE '0\.0\.0\.0:8080|\[::\]:8080|\*:8080'; then
    # Prefer binding fix after wizard; temporary filter:
    if ! sudo iptables -C INPUT -p tcp --dport 8080 ! -s 127.0.0.1 -j REJECT 2>/dev/null; then
      sudo iptables -I INPUT 1 -p tcp --dport 8080 ! -s 127.0.0.1 -j REJECT
      log "iptables: reject public 8080 (loopback only effective)"
    fi
  fi
  for p in 25 465 587 993 995 143 110 4190; do
    # ensure no ACCEPTs already — do not add public accepts
    if sudo iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null; then
      log "WARN: public ACCEPT exists for port $p — leaving as-is but documenting"
    fi
  done
}

sleep 2
lock_public_ports

# Restart with env if service exists
if systemctl list-unit-files | grep -q '^stalwart'; then
  sudo systemctl restart stalwart || true
  sleep 2
  systemctl is-active stalwart && log "stalwart active" || log "stalwart not active yet"
fi

# Clear password vars from shell memory where possible
unset RECOVERY_PASS ADMIN_PASS ARCHIVE_PASS AGENT_PASS

log "install phase complete — next: bootstrap config + accounts (separate step)"
log "restore=${RESTORE}"
log "secrets_path=${SECRETS_FILE}"
log "log=${LOG}"
echo "OK restore=${RESTORE} secrets=${SECRETS_FILE} log=${LOG}"
