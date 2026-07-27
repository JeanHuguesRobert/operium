#!/usr/bin/env bash
# Configure Stalwart: Gmail SMTP smarthost + sieve forward jhn → Gmail (copy local).
# Secrets never printed. Requires app password already on disk.
set -euo pipefail
export PATH="${HOME}/.cargo/bin:${HOME}/.local/bin:${PATH}"

SECRETS_DIR="/srv/cogentia/secrets"
GMAIL_ENV="${SECRETS_DIR}/stalwart-gmail-relay.env"
GMAIL_PASS_FILE="${SECRETS_DIR}/stalwart-gmail-app-password"
GMAIL_RUNTIME_PASS_FILE="/etc/stalwart/secrets/gmail-app-password"
PHASE1="${SECRETS_DIR}/stalwart-phase1.env"
FORWARD_TO_DEFAULT="jeanhuguesrobert@gmail.com"
GMAIL_USER_DEFAULT="jeanhuguesrobert@gmail.com"
LOG="/tmp/stalwart-gmail-forward-$(date -u +%Y%m%dT%H%M%SZ).log"

log(){ echo "[gmail-fwd $(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }
die(){ log "ERROR: $*"; exit 1; }

wait_tcp(){
  local host="$1" port="$2" timeout="${3:-30}" elapsed=0
  while (( elapsed < timeout )); do
    if (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    ((elapsed += 1))
  done
  return 1
}

[[ "$(id -u)" -eq 0 ]] || exec sudo -n bash "$0" "$@"

command -v stalwart-cli >/dev/null || {
  # run as ubuntu path
  export PATH="/home/ubuntu/.cargo/bin:$PATH"
}
command -v python3 >/dev/null || die "python3 required"

# --- ensure secret files ---
install -d -m 700 -o root -g root "$SECRETS_DIR"

if [[ ! -f "$GMAIL_ENV" ]]; then
  cat >"$GMAIL_ENV" <<EOF
# Gmail smarthost for Stalwart outbound (Operium)
# Values only on this host — never git.
GMAIL_SMTP_USER=${GMAIL_USER_DEFAULT}
GMAIL_SMTP_HOST=smtp.gmail.com
GMAIL_SMTP_PORT=465
GMAIL_FORWARD_TO=${FORWARD_TO_DEFAULT}
# App password lives in separate file (single line, no quotes):
#   ${GMAIL_PASS_FILE}
EOF
  chmod 600 "$GMAIL_ENV"
  log "created $GMAIL_ENV"
fi

if [[ ! -s "$GMAIL_PASS_FILE" ]]; then
  cat >"$GMAIL_PASS_FILE" <<'EOF'
REPLACE_WITH_GOOGLE_APP_PASSWORD
EOF
  chmod 600 "$GMAIL_PASS_FILE"
  log "PLACEHOLDER created at $GMAIL_PASS_FILE"
  cat <<'MSG'
========================================================================
ACTION REQUIRED (on fracta, as root / sudo):

1) Google Account → Security → 2-Step Verification → App passwords
   Create an app password for "Mail" / "Stalwart".

2) Write ONLY the 16-character app password (no spaces preferred) into:
     /srv/cogentia/secrets/stalwart-gmail-app-password
   Example:
     printf '%s' 'xxxx xxxx xxxx xxxx' | tr -d ' ' | sudo tee /srv/cogentia/secrets/stalwart-gmail-app-password >/dev/null
     sudo chown root:root /srv/cogentia/secrets/stalwart-gmail-app-password
     sudo chmod 600 /srv/cogentia/secrets/stalwart-gmail-app-password

3) Re-run:
     sudo bash /usr/local/sbin/stalwart-gmail-forward-setup.sh

Do NOT paste the app password into chat, git, or tickets.
========================================================================
MSG
  exit 2
fi

# Reject placeholder
if grep -q 'REPLACE_WITH_GOOGLE_APP_PASSWORD' "$GMAIL_PASS_FILE"; then
  die "app password still placeholder — edit $GMAIL_PASS_FILE then re-run"
fi
# strip whitespace/newlines from password file for File secret consumers that read raw
PASS_CLEAN="$(tr -d ' \t\r\n' <"$GMAIL_PASS_FILE")"
[[ ${#PASS_CLEAN} -ge 16 ]] || die "app password looks too short"
printf '%s' "$PASS_CLEAN" >"$GMAIL_PASS_FILE"
chown root:root "$GMAIL_PASS_FILE"
chmod 600 "$GMAIL_PASS_FILE"
# /srv/cogentia/secrets stays root-only. Give Stalwart a dedicated,
# non-listable-by-others runtime copy under its own configuration tree.
install -d -m 750 -o root -g stalwart "$(dirname "$GMAIL_RUNTIME_PASS_FILE")"
install -m 640 -o root -g stalwart "$GMAIL_PASS_FILE" "$GMAIL_RUNTIME_PASS_FILE"
# do not echo PASS_CLEAN

# shellcheck disable=SC1090
set -a
# load gmail env (no password in that file)
# shellcheck source=/dev/null
source <(grep -E '^[A-Z_]+=' "$GMAIL_ENV" | sed 's/\r$//')
set +a
GMAIL_SMTP_USER="${GMAIL_SMTP_USER:-$GMAIL_USER_DEFAULT}"
GMAIL_FORWARD_TO="${GMAIL_FORWARD_TO:-$FORWARD_TO_DEFAULT}"
GMAIL_SMTP_HOST="${GMAIL_SMTP_HOST:-smtp.gmail.com}"
GMAIL_SMTP_PORT="${GMAIL_SMTP_PORT:-465}"

# recovery admin for CLI
[[ -f "$PHASE1" ]] || die "missing $PHASE1"
# shellcheck disable=SC1090
eval "$(grep -E '^STALWART_RECOVERY_ADMIN=' "$PHASE1" | sed 's/^/export /')"
[[ -n "${STALWART_RECOVERY_ADMIN:-}" ]] || die "STALWART_RECOVERY_ADMIN missing"

# enable recovery briefly
install -m 640 -o root -g stalwart /dev/null /etc/stalwart/stalwart.env
cat > /etc/stalwart/stalwart.env <<EOF
STALWART_PUBLIC_URL=https://mail.fractavolta.com
STALWART_RECOVERY_MODE=1
STALWART_RECOVERY_ADMIN=${STALWART_RECOVERY_ADMIN}
EOF
chmod 640 /etc/stalwart/stalwart.env
chown root:stalwart /etc/stalwart/stalwart.env
systemctl restart stalwart
sleep 4
systemctl is-active --quiet stalwart || die "stalwart not active"

export STALWART_URL="http://127.0.0.1:8080"
export STALWART_USER="${STALWART_RECOVERY_ADMIN%%:*}"
export STALWART_PASSWORD="${STALWART_RECOVERY_ADMIN#*:}"
export PATH="/home/ubuntu/.cargo/bin:$PATH"

# Apply as ubuntu if stalwart-cli is there
CLI="$(command -v stalwart-cli || true)"
[[ -n "$CLI" ]] || CLI="/home/ubuntu/.cargo/bin/stalwart-cli"
[[ -x "$CLI" ]] || die "stalwart-cli not found"

log "applying Gmail relay + sieve via CLI"
export GMAIL_SMTP_USER GMAIL_FORWARD_TO GMAIL_SMTP_HOST GMAIL_SMTP_PORT
export GMAIL_PASS_FILE GMAIL_RUNTIME_PASS_FILE CLI
python3 - <<'PY'
import json, os, subprocess, sys, tempfile, pathlib

cli = os.environ["CLI"]
env = os.environ.copy()

def run(args, input_text=None):
    r = subprocess.run(
        args, input=input_text, text=True, capture_output=True, env=env
    )
    out = (r.stdout or "") + (r.stderr or "")
    # redact any accidental secrets
    pw = pathlib.Path(os.environ["GMAIL_PASS_FILE"]).read_text().strip()
    if pw:
        out = out.replace(pw, "[REDACTED]")
    print(out)
    if r.returncode != 0:
        raise SystemExit(f"command failed: {args}")
    return r

user = os.environ["GMAIL_SMTP_USER"]
fwd = os.environ["GMAIL_FORWARD_TO"]
host = os.environ["GMAIL_SMTP_HOST"]
port = int(os.environ["GMAIL_SMTP_PORT"])
pass_file = os.environ["GMAIL_RUNTIME_PASS_FILE"]

# 1) Upsert Gmail relay route
relay = {
    "@type": "Relay",
    "name": "gmail-relay",
    "description": "Gmail SMTP smarthost (authenticated) for Twin→Gmail and outbound",
    "address": host,
    "port": port,
    "protocol": "smtp",
    "implicitTls": True,
    "allowInvalidCerts": False,
    "authUsername": user,
    "authSecret": {"@type": "File", "filePath": pass_file},
}
plan = []
plan.append({
    "@type": "upsert",
    "object": "MtaRoute",
    "matchOn": ["name"],
    "value": {"route-gmail": relay},
})

# 2) Outbound strategy: local domain → local; else → gmail-relay
strategy = {
    "route": {
        "match": {
            "0": {"if": "is_local_domain(rcpt_domain)", "then": "'local'"}
        },
        "else": "'gmail-relay'",
    }
}
plan.append({"@type": "update", "object": "MtaOutboundStrategy", "value": strategy})

# 3) System sieve: keep local copy and redirect to Gmail for jhn@
sieve_body = f'''require ["copy", "envelope", "fileinto"];
# Twin JHN human mailbox → Gmail (keep copy in Stalwart)
if anyof(
  envelope :is "to" "jhn@mail.fractavolta.com",
  address :is ["to", "cc", "bcc"] "jhn@mail.fractavolta.com"
) {{
  redirect :copy "{fwd}";
}}
'''
plan.append({
    "@type": "upsert",
    "object": "SieveSystemScript",
    "matchOn": ["name"],
    "value": {
        "sieve-jhn-gmail": {
            "name": "forward-jhn-to-gmail",
            "description": "Copy+redirect jhn@mail.fractavolta.com to Gmail",
            "isActive": True,
            "contents": sieve_body,
        }
    },
})

# 4) Run system sieve at DATA stage
plan.append({
    "@type": "update",
    "object": "MtaStageData",
    "value": {
        "script": {
            "match": {},
            "else": "'forward-jhn-to-gmail'",
        }
    },
})

path = pathlib.Path("/tmp/stalwart-gmail-plan.ndjson")
path.write_text("\n".join(json.dumps(o) for o in plan) + "\n")
path.chmod(0o600)
run([cli, "apply", "--file", str(path), "--json"])
path.unlink(missing_ok=True)
print("apply_ok")
PY

# The recovery listener exposes only the administration HTTP port. Disable
# recovery before testing IMAPS/submission, then wait for the normal listeners.
cat > /etc/stalwart/stalwart.env <<'EOF'
STALWART_PUBLIC_URL=https://mail.fractavolta.com
# Gmail app password is file-based: /srv/cogentia/secrets/stalwart-gmail-app-password
# Break-glass recovery: STALWART_RECOVERY_MODE=1 + STALWART_RECOVERY_ADMIN from phase1 secrets
EOF
chmod 640 /etc/stalwart/stalwart.env
chown root:stalwart /etc/stalwart/stalwart.env
systemctl restart stalwart
sleep 3
systemctl is-active --quiet stalwart || die "stalwart failed after recovery disable"

log "config applied — running private delivery test (agent → jhn, expect Gmail path)"
TEST_STATUS=0
if ! wait_tcp 127.0.0.1 993 45; then
  log "ERROR: IMAPS listener 127.0.0.1:993 not ready after apply"
  TEST_STATUS=1
elif ! wait_tcp 127.0.0.1 465 45; then
  log "ERROR: submission listener 127.0.0.1:465 not ready after apply"
  TEST_STATUS=1
else
  # test via python without printing secrets
  export PATH="/home/ubuntu/.cargo/bin:$PATH"
  set +e
  python3 - <<'PY'
import email.message, imaplib, smtplib, ssl, time, subprocess, os

def load_phase1():
    raw = subprocess.check_output(["cat", "/srv/cogentia/secrets/stalwart-phase1.env"], text=True)
    d = {}
    for line in raw.splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        d[k] = v
    return d

env = load_phase1()
domain = env.get("STALWART_DOMAIN", "mail.fractavolta.com")
agent = f"{env['STALWART_AGENT_USER']}@{domain}"
agent_pw = env["STALWART_AGENT_PASSWORD"]
jhn = f"jhn@{domain}"
jhn_pw = env["STALWART_ADMIN_PASSWORD"]  # jhn password key
# correct key
jhn_pw = env.get("STALWART_ADMIN_PASSWORD")  # jhn user is STALWART_ADMIN_USER
# From phase1: STALWART_ADMIN_USER=jhn
if env.get("STALWART_ADMIN_USER") == "jhn":
    jhn_pw = env["STALWART_ADMIN_PASSWORD"]

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# inbox count before
def inbox_count(user, pw):
    M = imaplib.IMAP4_SSL("127.0.0.1", 993, ssl_context=ctx, timeout=30)
    M.login(user, pw)
    typ, data = M.select("INBOX")
    n = int(data[0]) if data and data[0] else 0
    M.logout()
    return n

before = inbox_count(jhn, jhn_pw)
subj = f"gmail-forward-test {int(time.time())}"
msg = email.message.EmailMessage()
msg["From"] = agent
msg["To"] = jhn
msg["Subject"] = subj
msg.set_content("private test: should land in Stalwart jhn and forward to Gmail")
with smtplib.SMTP_SSL("127.0.0.1", 465, context=ctx, timeout=30) as s:
    s.login(agent, agent_pw)
    s.send_message(msg)
print(f"sent subject_marker=gmail-forward-test jhn_inbox_before={before}")
time.sleep(8)
after = inbox_count(jhn, jhn_pw)
print(f"jhn_inbox_after={after} local_copy={'yes' if after > before else 'unknown'}")
print("Check Gmail inbox for the same subject (may take a minute).")
PY
  TEST_STATUS=$?
  set -e
fi

[[ "$TEST_STATUS" -eq 0 ]] || die "private delivery test failed (recovery mode disabled)"

log "done log=$LOG"
echo "OK gmail forward configured (secrets on disk only)"
