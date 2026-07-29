#!/usr/bin/env bash
# Install phase-2 backup timer, logrotate, scripts on fracta. Run via ssh as ubuntu+sudo.
set -euo pipefail
log(){ echo "[phase2] $*"; }

SCRIPTS_SRC="${1:-/tmp/stalwart-ops}"
[[ -d "$SCRIPTS_SRC" ]] || { log "missing $SCRIPTS_SRC"; exit 1; }

sudo install -m 750 -o root -g root "$SCRIPTS_SRC/stalwart-backup.sh" /usr/local/sbin/stalwart-backup.sh
sudo install -m 750 -o root -g root "$SCRIPTS_SRC/stalwart-restore.sh" /usr/local/sbin/stalwart-restore.sh
sudo install -m 750 -o root -g root "$SCRIPTS_SRC/stalwart-sync-caddy-cert.sh" /usr/local/sbin/stalwart-sync-caddy-cert.sh
sudo install -m 755 -o root -g root "$SCRIPTS_SRC/stalwart-phase2-tests.py" /usr/local/sbin/stalwart-phase2-tests.py

sudo install -m 644 "$SCRIPTS_SRC/stalwart-backup.service" /etc/systemd/system/stalwart-backup.service
sudo install -m 644 "$SCRIPTS_SRC/stalwart-backup.timer" /etc/systemd/system/stalwart-backup.timer
sudo install -m 644 "$SCRIPTS_SRC/stalwart-cert-sync.service" /etc/systemd/system/stalwart-cert-sync.service
sudo install -m 644 "$SCRIPTS_SRC/stalwart-cert-sync.timer" /etc/systemd/system/stalwart-cert-sync.timer
sudo install -m 644 "$SCRIPTS_SRC/logrotate-stalwart" /etc/logrotate.d/stalwart

sudo mkdir -p /var/backups/stalwart
sudo chmod 700 /var/backups/stalwart

# Ensure enabled at boot
sudo systemctl enable stalwart.service
sudo systemctl daemon-reload
sudo systemctl enable --now stalwart-backup.timer
sudo systemctl enable --now stalwart-cert-sync.timer

log "run first backup"
sudo /usr/local/sbin/stalwart-backup.sh

log "logrotate dry-run"
sudo logrotate -d /etc/logrotate.d/stalwart 2>&1 | tail -20 || true

log "timers"
systemctl list-timers 'stalwart*' --no-pager || true
systemctl is-enabled stalwart stalwart-backup.timer
log "done"
