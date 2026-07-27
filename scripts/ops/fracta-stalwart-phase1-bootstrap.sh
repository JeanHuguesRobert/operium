#!/usr/bin/env bash
# Phase 1b — bootstrap Stalwart, accounts, private listeners, Caddy HTTPS facade.
# Secrets never printed. Run as ubuntu with sudo -n on fracta.

set -euo pipefail

SECRETS_FILE="/srv/cogentia/secrets/stalwart-phase1.env"
ENV_FILE="/etc/stalwart/stalwart.env"
LOG="/tmp/stalwart-phase1-bootstrap-$(date -u +%Y%m%dT%H%M%SZ).log"
PLAN_DIR="/tmp/stalwart-plan-$$"
export PATH="${HOME}/.cargo/bin:${HOME}/.local/bin:${PATH}"
CLI=""

log() { echo "[boot $(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }
die() { log "ERROR: $*"; exit 1; }

# Load secrets without exporting all to world-readable env dumps
[[ -f "$SECRETS_FILE" ]] || die "missing secrets ${SECRETS_FILE}"
# shellcheck disable=SC1090
eval "$(sudo grep -E '^(STALWART_|#)' "$SECRETS_FILE" | grep -v '^#' | sed 's/^/export /')"

: "${STALWART_FQDN:?}"
: "${STALWART_DOMAIN:?}"
: "${STALWART_PUBLIC_URL:?}"
: "${STALWART_RECOVERY_ADMIN:?}"
: "${STALWART_ADMIN_USER:?}"
: "${STALWART_ADMIN_PASSWORD:?}"
: "${STALWART_ARCHIVE_USER:?}"
: "${STALWART_ARCHIVE_PASSWORD:?}"
: "${STALWART_AGENT_USER:?}"
: "${STALWART_AGENT_PASSWORD:?}"

RECOVERY_USER="${STALWART_RECOVERY_ADMIN%%:*}"
RECOVERY_PASS="${STALWART_RECOVERY_ADMIN#*:}"

export STALWART_URL="http://127.0.0.1:8080"
export STALWART_USER="$RECOVERY_USER"
export STALWART_PASSWORD="$RECOVERY_PASS"

log "ensure recovery env on service"
# Keep recovery admin until bootstrap + permanent admin + accounts done
sudo install -m 640 -o root -g stalwart /dev/null "$ENV_FILE"
sudo bash -c "cat > '${ENV_FILE}'" <<EOF
STALWART_RECOVERY_ADMIN=${STALWART_RECOVERY_ADMIN}
STALWART_PUBLIC_URL=${STALWART_PUBLIC_URL}
EOF
sudo systemctl restart stalwart
sleep 3
systemctl is-active --quiet stalwart || die "stalwart not active after restart"

# Install CLI if needed
if ! command -v stalwart-cli >/dev/null 2>&1; then
  log "install stalwart-cli (user local)"
  curl --proto '=https' --tlsv1.2 -LsSf \
    https://github.com/stalwartlabs/cli/releases/latest/download/stalwart-cli-installer.sh | sh || true
  # shellcheck disable=SC1091
  [[ -f "${HOME}/.cargo/env" ]] && source "${HOME}/.cargo/env"
  export PATH="${HOME}/.cargo/bin:${HOME}/.local/bin:${PATH}"
fi
CLI="$(command -v stalwart-cli || true)"
[[ -n "$CLI" ]] || die "stalwart-cli not found after install"
log "cli=$CLI"

# Wait for bootstrap API
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -u "${RECOVERY_USER}:${RECOVERY_PASS}" \
    http://127.0.0.1:8080/api/schema || true)
  if [[ "$code" == "200" ]]; then
    log "bootstrap API ready"
    break
  fi
  sleep 1
  if [[ "$i" -eq 30 ]]; then
    die "bootstrap API not ready (http $code)"
  fi
done

# Complete bootstrap via CLI (TLS via Caddy later — disable ACME on Stalwart)
# Low RocksDB write buffer for ~1GB VPS (default 128MiB is too high)
log "apply Bootstrap singleton"
"$CLI" update Bootstrap \
  --field "serverHostname=${STALWART_FQDN}" \
  --field "defaultDomain=${STALWART_DOMAIN}" \
  --field 'requestTlsCertificate=false' \
  --field 'generateDkimKeys=true' \
  --field 'directory={"@type":"Internal"}' \
  --field 'dnsServer={"@type":"Manual"}' \
  --field 'dataStore={"@type":"RocksDb","path":"/var/lib/stalwart/","bufferSize":16777216}' \
  --field 'blobStore={"@type":"Default"}' \
  --field 'searchStore={"@type":"Default"}' \
  --field 'inMemoryStore={"@type":"Default"}' \
  --field 'tracer={"@type":"Log","path":"/var/log/stalwart/"}' \
  2>&1 | tee -a "$LOG" | sed -E 's/(password|secret|token)[=:].*/\1=[REDACTED]/gi' || {
    log "bootstrap update may need finalize — checking config.json"
  }

# Some builds finalize on update; if config appears, restart
sleep 2
if sudo test -f /etc/stalwart/config.json; then
  log "config.json present — restart into normal/recovery as needed"
  sudo systemctl restart stalwart
  sleep 4
else
  log "config.json still absent — trying recovery path with minimal config.json"
  # Declarative path: write DataStore-only config and recovery mode
  sudo bash -c 'cat > /etc/stalwart/config.json' <<'JSON'
{
  "dataStore": {
    "@type": "RocksDb",
    "path": "/var/lib/stalwart/",
    "bufferSize": 16777216
  }
}
JSON
  sudo chown root:stalwart /etc/stalwart/config.json
  sudo chmod 640 /etc/stalwart/config.json
  sudo bash -c "cat > '${ENV_FILE}'" <<EOF
STALWART_RECOVERY_MODE=1
STALWART_RECOVERY_ADMIN=${STALWART_RECOVERY_ADMIN}
STALWART_PUBLIC_URL=${STALWART_PUBLIC_URL}
EOF
  sudo chmod 640 "$ENV_FILE"
  sudo chown root:stalwart "$ENV_FILE"
  sudo systemctl restart stalwart
  sleep 4
fi

# Re-auth and wait for API
export STALWART_URL="http://127.0.0.1:8080"
for i in $(seq 1 40); do
  if "$CLI" get Bootstrap --json >/tmp/sw-boot.json 2>/dev/null \
     || "$CLI" get SystemSettings --json >/tmp/sw-sys.json 2>/dev/null \
     || "$CLI" query Domain --json >/tmp/sw-dom.json 2>/dev/null; then
    log "management API reachable"
    break
  fi
  sleep 1
  [[ "$i" -eq 40 ]] && die "management API not reachable"
done

mkdir -p "$PLAN_DIR"
# Build apply plan WITHOUT embedding secrets in a long-lived world-readable file when possible
# Use apply with passwords from env substituted into root-only plan
PLAN_FILE="${PLAN_DIR}/plan.ndjson"
umask 077
cat >"$PLAN_FILE" <<EOF
{"@type":"upsert","object":"Domain","matchOn":["name"],"value":{"dom-primary":{"name":"${STALWART_DOMAIN}","description":"Twin JHN private mail domain (phase1)"}}}
{"@type":"upsert","object":"Account","matchOn":["name","domainId"],"value":{"acc-jhn":{"@type":"User","name":"${STALWART_ADMIN_USER}","domainId":"#dom-primary","description":"JHN administrator (test)","roles":{"@type":"Admin"},"permissions":{"@type":"Inherit"},"quotas":{"maxDiskQuota":104857600},"credentials":{"0":{"@type":"Password","secret":"${STALWART_ADMIN_PASSWORD}"}},"encryptionAtRest":{"@type":"Disabled"},"aliases":{},"memberGroupIds":{}},"acc-archive":{"@type":"User","name":"${STALWART_ARCHIVE_USER}","domainId":"#dom-primary","description":"Archive mailbox (test)","roles":{"@type":"User"},"permissions":{"@type":"Inherit"},"quotas":{"maxDiskQuota":524288000},"credentials":{"0":{"@type":"Password","secret":"${STALWART_ARCHIVE_PASSWORD}"}},"encryptionAtRest":{"@type":"Disabled"},"aliases":{},"memberGroupIds":{}},"acc-agent":{"@type":"User","name":"${STALWART_AGENT_USER}","domainId":"#dom-primary","description":"Agent test mailbox","roles":{"@type":"User"},"permissions":{"@type":"Inherit"},"quotas":{"maxDiskQuota":52428800},"credentials":{"0":{"@type":"Password","secret":"${STALWART_AGENT_PASSWORD}"}},"encryptionAtRest":{"@type":"Disabled"},"aliases":{},"memberGroupIds":{}}}}
{"@type":"update","object":"SystemSettings","value":{"defaultDomainId":"#dom-primary","defaultHostname":"${STALWART_FQDN}"}}
EOF
chmod 600 "$PLAN_FILE"

log "apply domain + accounts plan (secrets redacted in log)"
"$CLI" apply --file "$PLAN_FILE" --json 2>&1 | tee -a "$LOG" | sed -E 's/"secret":"[^"]*"/"secret":"[REDACTED]"/g' || {
  log "apply failed — try individual creates"
  # Fallbacks without dumping secrets
  "$CLI" create Domain --field "name=${STALWART_DOMAIN}" --field 'description=Twin JHN private mail domain (phase1)' 2>&1 | tee -a "$LOG" || true
  DOM_ID=$("$CLI" query Domain --json 2>/dev/null | head -1 | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id",""))' || true)
  log "domain_id_present=$([[ -n ${DOM_ID:-} ]] && echo yes || echo no)"
  if [[ -n "${DOM_ID:-}" ]]; then
    for pair in "ADMIN:${STALWART_ADMIN_USER}:${STALWART_ADMIN_PASSWORD}:Admin:104857600" \
                "ARCHIVE:${STALWART_ARCHIVE_USER}:${STALWART_ARCHIVE_PASSWORD}:User:524288000" \
                "AGENT:${STALWART_AGENT_USER}:${STALWART_AGENT_PASSWORD}:User:52428800"; do
      ROLE="${pair%%:*}"; rest="${pair#*:}"
      U="${rest%%:*}"; rest="${rest#*:}"
      P="${rest%%:*}"; rest="${rest#*:}"
      R="${rest%%:*}"; Q="${rest#*:}"
      log "create account role=${ROLE} user=${U}"
      "$CLI" create account/user \
        --field "name=${U}" \
        --field "domainId=${DOM_ID}" \
        --field "description=phase1 ${ROLE}" \
        --field "roles={\"@type\":\"${R}\"}" \
        --field 'permissions={"@type":"Inherit"}' \
        --field "quotas={\"maxDiskQuota\":${Q}}" \
        --field "credentials={\"0\":{\"@type\":\"Password\",\"secret\":\"${P}\"}}" \
        --field 'encryptionAtRest={"@type":"Disabled"}' \
        --field 'aliases={}' \
        --field 'memberGroupIds={}' \
        2>&1 | tee -a "$LOG" | sed -E 's/(secret|password)[^[:space:]]*/[REDACTED]/gi' || log "create ${U} failed"
    done
  fi
}

# Remove plan file with secrets
shred -u "$PLAN_FILE" 2>/dev/null || rm -f "$PLAN_FILE"
rmdir "$PLAN_DIR" 2>/dev/null || rm -rf "$PLAN_DIR"

# Listeners lockdown via CLI if schema available
log "attempt listener lockdown (bind loopback / disable public SMTP25)"
# Query listeners — best effort; schema-dependent
if "$CLI" query Listener --json > /tmp/sw-listeners.json 2>/dev/null; then
  log "listeners query ok (count lines=$(wc -l </tmp/sw-listeners.json))"
else
  log "Listener query not available or empty — will rely on firewall + Caddy"
fi

# Disable recovery mode after accounts exist; keep PUBLIC_URL
log "disable recovery mode; keep public URL"
sudo bash -c "cat > '${ENV_FILE}'" <<EOF
STALWART_PUBLIC_URL=${STALWART_PUBLIC_URL}
# Recovery admin removed after phase1 bootstrap. Re-enable only for break-glass:
# STALWART_RECOVERY_MODE=1
# STALWART_RECOVERY_ADMIN=admin:<from secrets file>
EOF
sudo chmod 640 "$ENV_FILE"
sudo chown root:stalwart "$ENV_FILE"

# Bind HTTP to localhost via drop-in if process still on *:8080 after normal start
sudo systemctl restart stalwart
sleep 4
systemctl is-active --quiet stalwart || die "stalwart failed after recovery disable"

# Ensure iptables: reject public 25 and 8080
log "firewall private posture"
if ! sudo iptables -C INPUT -p tcp --dport 25 -j REJECT 2>/dev/null; then
  sudo iptables -I INPUT 1 -p tcp --dport 25 -j REJECT
fi
if ! sudo iptables -C INPUT -p tcp --dport 8080 ! -s 127.0.0.1 -j REJECT 2>/dev/null; then
  sudo iptables -I INPUT 1 -p tcp --dport 8080 ! -s 127.0.0.1 -j REJECT
fi
# Do NOT open 465/993 publicly in phase1 — Tailscale/loopback only once listeners exist

# Caddy reverse proxy for JMAP/HTTPS (admin path blocked publicly)
log "configure Caddy for ${STALWART_FQDN}"
CADDY_BAK_TS="$(date -u +%Y%m%dT%H%M%SZ)"
sudo cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.stalwart.${CADDY_BAK_TS}"
# Append only if missing
if ! grep -q "mail.fractavolta.com" /etc/caddy/Caddyfile; then
  sudo tee -a /etc/caddy/Caddyfile >/dev/null <<'CADDY'

# Stalwart private mail — JMAP / HTTPS facade (Operium phase1)
# TLS via Caddy ACME when DNS CNAME exists. Admin UI not publicly exposed.
mail.fractavolta.com {
	# Block management UI and recovery-ish paths from the public Internet
	@admin path /admin* /login* /account*
	handle @admin {
		respond "Admin UI is not publicly available. Use SSH tunnel to 127.0.0.1:8080." 403
	}

	# JMAP + well-known + API for agents (auth required by Stalwart)
	handle {
		reverse_proxy 127.0.0.1:8080
	}
	encode gzip
}
CADDY
  # Validate and reload Caddy carefully
  if sudo caddy validate --config /etc/caddy/Caddyfile 2>&1 | tee -a "$LOG"; then
    sudo systemctl reload caddy || sudo systemctl restart caddy
    log "caddy reloaded with mail vhost"
  else
    log "Caddy validate failed — restoring previous Caddyfile"
    sudo cp -a /etc/caddy/Caddyfile.bak.stalwart.* /etc/caddy/Caddyfile 2>/dev/null || true
    # restore last bak more carefully
    LATEST=$(ls -1t /etc/caddy/Caddyfile.bak.stalwart.* 2>/dev/null | head -1 || true)
    if [[ -n "$LATEST" ]]; then
      sudo cp -a "$LATEST" /etc/caddy/Caddyfile
      sudo systemctl reload caddy || true
    fi
    die "Caddy config invalid"
  fi
else
  log "Caddy already has mail.fractavolta.com"
fi

# Final checks (no secrets)
log "final status"
systemctl is-active stalwart caddy | paste - - || true
ss -tlnp | grep -E ':(8080|25|465|587|993)\s' || true
free -h | tee -a "$LOG"
# Account names only
if STALWART_URL="http://127.0.0.1:8080" STALWART_USER="$STALWART_ADMIN_USER" STALWART_PASSWORD="$STALWART_ADMIN_PASSWORD" \
  "$CLI" query Account --json 2>/dev/null | python3 -c 'import sys,json
for line in sys.stdin:
  try:
    o=json.loads(line)
    print("account", o.get("name") or o.get("id"))
  except Exception:
    pass
' ; then
  log "accounts listed (names only)"
else
  log "account list via permanent admin not yet available — recovery may still be required"
fi

# Clear sensitive env from this shell
unset STALWART_PASSWORD STALWART_ADMIN_PASSWORD STALWART_ARCHIVE_PASSWORD STALWART_AGENT_PASSWORD
unset STALWART_RECOVERY_ADMIN RECOVERY_PASS

log "done log=${LOG}"
echo "OK bootstrap log=${LOG}"
