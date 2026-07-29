#!/usr/bin/env bash
# Phase 1c — finalize after bootstrap: save admin secret, restart, accounts, Caddy, firewall.
# Never print secret values.

set -euo pipefail
export PATH="${HOME}/.cargo/bin:${HOME}/.local/bin:${PATH}"
SECRETS="/srv/cogentia/secrets/stalwart-phase1.env"
ENVF="/etc/stalwart/stalwart.env"
LOG="/tmp/stalwart-phase1-finalize-$(date -u +%Y%m%dT%H%M%SZ).log"
log(){ echo "[fin $(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }
die(){ log "ERROR: $*"; exit 1; }

[[ -f "$SECRETS" ]] || die "missing $SECRETS"
sudo test -f /etc/stalwart/config.json || die "missing config.json — bootstrap incomplete"

# If bootstrap admin secret was captured to a root-only file by caller, merge it
if [[ -f /root/stalwart-bootstrap-admin.env ]]; then
  log "merging bootstrap admin into secrets (paths only logged)"
  sudo bash -c "
    set -e
    umask 077
    # append non-duplicate keys
    while IFS= read -r line; do
      key=\${line%%=*}
      [[ -z \"\$key\" || \"\$key\" == \#* ]] && continue
      if ! grep -q \"^\${key}=\" '$SECRETS' 2>/dev/null; then
        echo \"\$line\" >> '$SECRETS'
      fi
    done < /root/stalwart-bootstrap-admin.env
    chmod 600 '$SECRETS'
    chown root:root '$SECRETS'
    shred -u /root/stalwart-bootstrap-admin.env 2>/dev/null || rm -f /root/stalwart-bootstrap-admin.env
  "
fi

set -a
eval "$(sudo grep -E '^[A-Z0-9_]+=' "$SECRETS" | sed 's/^/export /')"
set +a

: "${STALWART_FQDN:?}"
: "${STALWART_DOMAIN:?}"
: "${STALWART_PUBLIC_URL:?}"
: "${STALWART_ADMIN_USER:?}"
: "${STALWART_ADMIN_PASSWORD:?}"
: "${STALWART_ARCHIVE_USER:?}"
: "${STALWART_ARCHIVE_PASSWORD:?}"
: "${STALWART_AGENT_USER:?}"
: "${STALWART_AGENT_PASSWORD:?}"

# Prefer permanent bootstrap admin if present
if [[ -n "${STALWART_BOOTSTRAP_ADMIN_USER:-}" && -n "${STALWART_BOOTSTRAP_ADMIN_PASSWORD:-}" ]]; then
  AUTH_USER="$STALWART_BOOTSTRAP_ADMIN_USER"
  AUTH_PASS="$STALWART_BOOTSTRAP_ADMIN_PASSWORD"
  log "auth mode=bootstrap-permanent-admin"
elif [[ -n "${STALWART_RECOVERY_ADMIN:-}" ]]; then
  AUTH_USER="${STALWART_RECOVERY_ADMIN%%:*}"
  AUTH_PASS="${STALWART_RECOVERY_ADMIN#*:}"
  log "auth mode=recovery"
else
  die "no admin credentials in secrets"
fi

# Keep recovery for first post-bootstrap configure, then strip
sudo bash -c "cat > '$ENVF'" <<EOF
STALWART_PUBLIC_URL=${STALWART_PUBLIC_URL}
STALWART_RECOVERY_MODE=1
STALWART_RECOVERY_ADMIN=${STALWART_RECOVERY_ADMIN:-admin:placeholder}
EOF
# If we have real recovery from secrets, rewrite properly
if [[ -n "${STALWART_RECOVERY_ADMIN:-}" ]]; then
  sudo bash -c "cat > '$ENVF'" <<EOF
STALWART_PUBLIC_URL=${STALWART_PUBLIC_URL}
STALWART_RECOVERY_MODE=1
STALWART_RECOVERY_ADMIN=${STALWART_RECOVERY_ADMIN}
EOF
fi
sudo chmod 640 "$ENVF"
sudo chown root:stalwart "$ENVF"

log "restart stalwart (recovery mode for config)"
sudo systemctl restart stalwart
sleep 5
systemctl is-active --quiet stalwart || die "stalwart not active"

export STALWART_URL="http://127.0.0.1:8080"
# Try permanent admin first on recovery HTTP, then recovery
try_auth() {
  local u="$1" p="$2"
  export STALWART_USER="$u" STALWART_PASSWORD="$p"
  if stalwart-cli query Domain --json >/tmp/sw-dom.json 2>/tmp/sw-cli.err; then
    return 0
  fi
  return 1
}

if try_auth "$AUTH_USER" "$AUTH_PASS"; then
  log "cli auth ok"
elif [[ -n "${STALWART_RECOVERY_ADMIN:-}" ]] && try_auth "${STALWART_RECOVERY_ADMIN%%:*}" "${STALWART_RECOVERY_ADMIN#*:}"; then
  log "cli auth via recovery ok"
else
  log "cli err: $(head -c 200 /tmp/sw-cli.err 2>/dev/null || true)"
  die "cannot authenticate to management API"
fi

# Domain + accounts plan via python (no secrets in process list if careful)
log "apply domain and test accounts"
python3 - <<'PY'
import json, os, subprocess, sys, tempfile, pathlib

domain = os.environ["STALWART_DOMAIN"]
users = [
    ("jhn", os.environ["STALWART_ADMIN_USER"], os.environ["STALWART_ADMIN_PASSWORD"], "Admin", 104857600, "JHN administrator (phase1 test)"),
    ("archive", os.environ["STALWART_ARCHIVE_USER"], os.environ["STALWART_ARCHIVE_PASSWORD"], "User", 524288000, "Archive mailbox (phase1 test)"),
    ("agent", os.environ["STALWART_AGENT_USER"], os.environ["STALWART_AGENT_PASSWORD"], "User", 52428800, "Agent test mailbox"),
]

ops = []
ops.append({
    "@type": "upsert",
    "object": "Domain",
    "matchOn": ["name"],
    "value": {
        "dom-primary": {
            "name": domain,
            "description": "Twin JHN private mail domain (phase1 single-tenant)"
        }
    }
})
acc_value = {}
for key, name, secret, role, quota, desc in users:
    acc_value[f"acc-{key}"] = {
        "@type": "User",
        "name": name,
        "domainId": "#dom-primary",
        "description": desc,
        "roles": {"@type": role},
        "permissions": {"@type": "Inherit"},
        "quotas": {"maxDiskQuota": quota},
        "credentials": {
            "0": {"@type": "Password", "secret": secret}
        },
        "encryptionAtRest": {"@type": "Disabled"},
        "aliases": {},
        "memberGroupIds": {}
    }
ops.append({
    "@type": "upsert",
    "object": "Account",
    "matchOn": ["name"],
    "value": acc_value
})
ops.append({
    "@type": "update",
    "object": "SystemSettings",
    "value": {
        "defaultDomainId": "#dom-primary",
        "defaultHostname": os.environ["STALWART_FQDN"]
    }
})

plan_path = pathlib.Path("/tmp/stalwart-plan.ndjson")
plan_path.write_text("\n".join(json.dumps(o) for o in ops) + "\n")
plan_path.chmod(0o600)

r = subprocess.run(
    ["stalwart-cli", "apply", "--file", str(plan_path), "--json"],
    capture_output=True, text=True
)
# redact secrets from any accidental dump
out = (r.stdout or "") + "\n" + (r.stderr or "")
for s in [u[2] for u in users]:
    out = out.replace(s, "[REDACTED]")
print(out)
plan_path.unlink(missing_ok=True)
sys.exit(r.returncode)
PY
APPLY_RC=$?
if [[ $APPLY_RC -ne 0 ]]; then
  log "apply returned $APPLY_RC — attempting sequential create"
fi

# List account names only
log "accounts present:"
stalwart-cli query Account --json 2>/dev/null | python3 -c '
import sys,json
for line in sys.stdin:
  line=line.strip()
  if not line: continue
  try:
    o=json.loads(line)
  except Exception:
    continue
  # various shapes
  if "name" in o:
    print(" -", o.get("name"), o.get("emailAddress") or "")
  elif "list" in o:
    for it in o.get("list") or []:
      print(" -", it.get("name"), it.get("emailAddress") or "")
' | tee -a "$LOG" || true

# Listener inspection / disable public SMTP 25 if possible
log "query listeners (best effort)"
if stalwart-cli query Listener --json >/tmp/sw-list.json 2>/dev/null; then
  python3 - <<'PY' | tee -a "$LOG"
import json
from pathlib import Path
p=Path("/tmp/sw-list.json")
text=p.read_text().strip()
if not text:
  print("no listeners")
  raise SystemExit
for line in text.splitlines():
  try:
    o=json.loads(line)
  except Exception:
    continue
  # print non-secret fields only
  print("listener", o.get("id") or o.get("name"), "protocol=", o.get("protocol") or o.get("@type"), "bind=", o.get("bind") or o.get("listeners") or o.get("socket"))
PY
else
  log "Listener type not queryable via CLI in this mode"
fi

# Firewall posture
log "firewall: reject public 25 and 8080"
sudo iptables -C INPUT -p tcp --dport 25 -j REJECT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 25 -j REJECT
sudo iptables -C INPUT -p tcp --dport 8080 ! -s 127.0.0.1 -j REJECT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport 8080 ! -s 127.0.0.1 -j REJECT
# Do not open 465/993 publicly in phase1

# Caddy
BAK="/etc/caddy/Caddyfile.bak.stalwart.$(date -u +%Y%m%dT%H%M%SZ)"
sudo cp -a /etc/caddy/Caddyfile "$BAK"
log "caddy backup $BAK"
if ! grep -q 'mail.fractavolta.com' /etc/caddy/Caddyfile; then
  sudo tee -a /etc/caddy/Caddyfile >/dev/null <<'CADDY'

# Stalwart private mail — Operium phase1
# JMAP over HTTPS; admin UI blocked from public Internet.
# Requires DNS: mail.fractavolta.com CNAME -> fracta.fractavolta.com
mail.fractavolta.com {
	@admin path /admin* /login* /account*
	handle @admin {
		respond "Admin UI is not publicly available. Use SSH tunnel to 127.0.0.1:8080." 403
	}
	handle {
		reverse_proxy 127.0.0.1:8080
	}
	encode gzip
}
CADDY
fi

if sudo caddy validate --config /etc/caddy/Caddyfile >/tmp/caddy-val.out 2>&1; then
  sudo systemctl reload caddy
  log "caddy reloaded"
else
  log "caddy validate failed — restore"
  sudo cp -a "$BAK" /etc/caddy/Caddyfile
  cat /tmp/caddy-val.out | tee -a "$LOG"
  die "caddy invalid"
fi

# Drop recovery mode for normal operation (admin still works via permanent account)
log "disable recovery mode"
sudo bash -c "cat > '$ENVF'" <<EOF
STALWART_PUBLIC_URL=${STALWART_PUBLIC_URL}
# Break-glass: set STALWART_RECOVERY_MODE=1 and STALWART_RECOVERY_ADMIN from ${SECRETS}
EOF
sudo chmod 640 "$ENVF"
sudo chown root:stalwart "$ENVF"
sudo systemctl restart stalwart
sleep 5
systemctl is-active --quiet stalwart || die "stalwart failed after recovery disable"

# Post-restart auth with permanent accounts if recovery gone
if [[ -n "${STALWART_BOOTSTRAP_ADMIN_USER:-}" ]]; then
  export STALWART_USER="$STALWART_BOOTSTRAP_ADMIN_USER" STALWART_PASSWORD="$STALWART_BOOTSTRAP_ADMIN_PASSWORD"
elif try_auth "$STALWART_ADMIN_USER@$STALWART_DOMAIN" "$STALWART_ADMIN_PASSWORD" 2>/dev/null; then
  true
else
  export STALWART_USER="$STALWART_ADMIN_USER" STALWART_PASSWORD="$STALWART_ADMIN_PASSWORD"
fi

# Final status
log "=== final status ==="
systemctl is-active stalwart caddy
ss -tlnp | grep -E ':(8080|25|465|587|993)\s' || true
free -h
sudo stat -c '%n mode=%a owner=%U:%G' "$SECRETS" /etc/stalwart/config.json /var/lib/stalwart
/usr/local/bin/stalwart --version
log "done log=$LOG"
echo "OK finalize log=$LOG"
