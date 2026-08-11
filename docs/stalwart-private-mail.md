---
title: "Stalwart mail for Digital Twin JHN (fracta)"
description: "Stalwart for Digital Twin JHN — private JMAP/IMAPS/submission, controlled public SMTP receive, backup/restore."
layout: default
date: 2026-07-27
last_modified_at: 2026-07-27
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/stalwart-private-mail.md
document_role: "operational"
document_kind: "runbook"
visibility: "public"
lifecycle_state: "active"
status: "phase3 — private mail and controlled public SMTP receive operational"
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "explicit-metadata"
classification_confidence: "medium"
---

# Stalwart mail for Digital Twin JHN (fracta)

Operium owns this operational surface. Application repos do not host parallel mail runbooks.

Companion notes:

- [Fracta trust perimeter](fracta-trust-perimeter.md)
- [fractavolta.com DNS zone](fractavolta-dns.md)
- [Secrets management](secrets-management.md)
- Secret-free templates: `templates/stalwart/`

**Success criterion:** reliable Twin mail, reversible and documented, with private
JMAP/IMAPS/submission and narrowly exposed Internet SMTP receive — not a general
public mail service.

---

## Architecture

```text
Agents / humans (private path)
  → SSH tunnel or future Tailscale
  → [optional] Caddy https://mail.fractavolta.com  (TLS; admin paths 403)
  → Stalwart HTTP 127.0.0.1:8080   (JMAP)
  → Stalwart IMAPS :993            (host firewall: not public)
  → Stalwart submission :465       (host firewall: not public)
  → RocksDB /var/lib/stalwart
  → secrets /srv/cogentia/secrets/ (root 600)
  → encrypted backups /var/backups/stalwart/*.tar.enc
```

```text
Internet public (phase 3)
  → Caddy :80/:443 only for existing + planned mail HTTPS facade
  → SMTP :25 to Stalwart for known local recipients only
  → IMAPS/submission/8080 not ACCEPTed publicly
  → Apex fractavolta.com MX remains Gandi (unchanged)
```

---

## Version and install

| Item | Value |
|------|--------|
| Host | `fracta` — Ubuntu 24.04 LTS, OCI Free Tier ~1 GiB RAM |
| Product | Stalwart Mail & Collaboration Server |
| Version | **0.16.15** (`/usr/local/bin/stalwart`) |
| Install | Official `https://get.stalw.art/install.sh` → **systemd** `stalwart.service` |
| Why not Docker | Fracta tooling profile forbids Docker; official FHS/systemd path is simplest to maintain |
| Boot | `systemctl is-enabled stalwart` → **enabled** |
| CLI | `stalwart-cli` in `~ubuntu/.cargo/bin` |
| Public URL env | `STALWART_PUBLIC_URL=https://mail.fractavolta.com` in `/etc/stalwart/stalwart.env` |
| Mail domain | `mail.fractavolta.com` (addresses `local@mail.fractavolta.com`) |

---

## Data locations

| Path | Role | Permissions |
|------|------|-------------|
| `/var/lib/stalwart/` | RocksDB mail/store | `750` `stalwart:stalwart` |
| `/etc/stalwart/config.json` | Datastore pointer / server config | `640` `root:stalwart` |
| `/etc/stalwart/stalwart.env` | Non-secret env (`PUBLIC_URL`; recovery optional) | `640` `root:stalwart` |
| `/etc/stalwart/tls/mail.fractavolta.com.{crt,key}` | Runtime copy of Caddy's Let's Encrypt certificate | `640` `root:stalwart` |
| `/var/log/stalwart/` | Service logs | logrotate daily, 14 days, maxsize 50M |
| `/srv/cogentia/secrets/stalwart-phase1.env` | Account/recovery secrets | `600` `root:root` |
| `/srv/cogentia/secrets/stalwart-backup.key` | AES backup passphrase material | `600` `root:root` |
| `/var/backups/stalwart/*.tar.enc` | Encrypted backups | dir `700`, files `600` root |
| `/root/restore-pre-stalwart-*` | Pre-install restore points | root |

**Never** commit secret files or backup key material to git.

---

## Ports

| Port | Process | Public exposure |
|------|---------|-----------------|
| 80 / 443 | Caddy | Yes (existing + `mail.*` vhost when DNS exists) |
| 8080 | Stalwart HTTP/JMAP | **No** — REJECT non-loopback; admin UI also 403 on Caddy |
| 25 | Stalwart SMTP | **Yes** — host firewall + OCI stateful ingress; known local recipients only |
| 465 | Submission (TLS) | **No** public ACCEPT (private/loopback/mesh only) |
| 993 | IMAPS | **No** public ACCEPT |
| 22 | SSH | Yes (operator) |

Verified 2026-07-27: Stalwart binds IPv4/IPv6 on port 25, accepts
`jhn@mail.fractavolta.com`, rejects unknown local recipients, rejects external
relay, and advertises STARTTLS. Host firewall and OCI VCN/security-list ingress
permit TCP 25; external delivery from Gmail succeeded.

---

## Backup (encrypted)

### Mechanism

1. Optional short `systemctl stop stalwart` for consistent RocksDB snapshot.
2. Bundle: data tar + conf tar + secrets file + Caddyfile copy + manifest.
3. Encrypt with **OpenSSL AES-256-CBC PBKDF2** (`iter=200000`) using key file.
4. Write `/var/backups/stalwart/stalwart-<UTC>.tar.enc` + `.sha256`.
5. Retain **14 days**.
6. Abort if free space on `/` is critically low (`STALWART_BACKUP_MIN_AVAIL_PCT`, default 15%).

### Commands

```bash
# Manual backup
ssh fracta 'sudo /usr/local/sbin/stalwart-backup.sh'

# Timer (daily ~03:45 UTC + random delay)
ssh fracta 'systemctl list-timers stalwart-backup.timer --no-pager'
ssh fracta 'systemctl status stalwart-backup.timer --no-pager'
```

Scripts (versioned in Operium):

- `scripts/ops/stalwart-backup.sh`
- `scripts/ops/stalwart-restore.sh`
- Units: `templates/stalwart/stalwart-backup.{service,timer}`
- Logrotate: `templates/stalwart/logrotate-stalwart`

### Restore

```bash
# List archives (root)
ssh fracta 'sudo ls -la /var/backups/stalwart/'

# Restore (stops service, snapshots current tree under /root/restore-pre-restore-*, restores, starts)
ssh fracta 'sudo /usr/local/sbin/stalwart-restore.sh /var/backups/stalwart/stalwart-YYYYMMDDTHHMMSSZ.tar.enc'

# Health
ssh fracta 'systemctl is-active stalwart; curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/.well-known/jmap'
```

Decrypt integrity check without restore: verify `.sha256` then `openssl enc -d …` (see script `scripts/ops/stalwart-phase2-verify-backup.sh`).

**Off-box copy:** rsync/Syncthing of `/var/backups/stalwart/` **and** separately the backup key + account secrets to a trusted host. Losing the key loses recoverability of archives.

---

## Logging

- Destination: `/var/log/stalwart/` (file tracer from bootstrap).
- logrotate: daily, 14 rotations, compress, `maxsize 50M`, `copytruncate`.
- Policy: operational diagnostics only; **do not** build long-term message archives from server logs. Message retention is mailbox/quota policy, not log retention.
- Inspect (no secrets in command):

  ```bash
  ssh fracta 'sudo journalctl -u stalwart -n 50 --no-pager'
  ssh fracta 'sudo ls -la /var/log/stalwart/'
  ```

---

## Disk control

- Backup refuses to run if free space estimate is below threshold.
- Mailbox quotas (phase 1 accounts): jhn 100 MiB, archive 500 MiB, agent-test 50 MiB (disk quota fields).
- Monitor:

  ```bash
  ssh fracta 'df -h /; sudo du -sh /var/lib/stalwart /var/backups/stalwart /var/log/stalwart'
  ```

---

## Status, update, restart

```bash
# Status
ssh fracta 'systemctl status stalwart --no-pager'
ssh fracta 'stalwart --version'

# Restart
ssh fracta 'sudo systemctl restart stalwart'

# Update (outline)
# 1) sudo /usr/local/sbin/stalwart-backup.sh
# 2) follow official docs: https://stalw.art/docs/install/platform/linux/
# 3) replace binary / re-run install script carefully
# 4) systemctl restart stalwart && run phase2 tests
ssh fracta 'sudo /usr/local/sbin/stalwart-phase2-tests.py'
```

---

## Multi-tenant model and how to extend

```text
tenant / Twin
  → domaine ou sous-domaine
    → comptes et alias d’agents
      → quotas, règles et archivage propres
```

Phase 1–2: **single** Twin domain `mail.fractavolta.com`. Do not invent extra production Twins until needed.

### Add a Twin (domain)

1. Choose a **new** domain/subdomain that does **not** steal apex Gandi MX.
2. `stalwart-cli` (via SSH tunnel / recovery as needed): upsert `Domain` + optional DKIM later.
3. Point discovery hostname only if that Twin needs HTTPS (Caddy vhost + DNS).
4. Document the Twin in Operium (this note or registry).

### Add an agent account

1. Generate password into secrets file (root-only), never chat/git.
2. Apply plan (`templates/stalwart/accounts-plan.ndjson.example` pattern) or:

   ```bash
   # Illustrative only — inject secret from file, do not paste passwords
   stalwart-cli create account/user --field name=agent-foo \
     --field domainId=<domainId> --field 'roles={"@type":"User"}' ...
   ```

3. Set `maxDiskQuota` appropriate for the agent.
4. Test JMAP discovery + SMTP submission privately.

### Add an alias

1. Update the target `Account` with an `aliases` entry (`name` + `domainId`).
2. Prefer declarative `stalwart-cli apply` upsert so re-runs stay idempotent.

---

## Private access (operators)

```bash
# Admin / JMAP without public admin UI
ssh -L 18080:127.0.0.1:8080 fracta
# Browser/API: http://127.0.0.1:18080/
# Caddy public /admin* returns 403 by design
```

DNS still required for **public** TLS on `mail.fractavolta.com`:

```text
mail.fractavolta.com.  CNAME  fracta.fractavolta.com.
```

---

## Phase 2 verification (2026-07-27)

Automated suite: `/usr/local/sbin/stalwart-phase2-tests.py` (source in Operium `scripts/ops/`).

| Check | Result |
|-------|--------|
| Service enabled on boot | PASS |
| Disk space | PASS (~41% used) |
| Firewall REJECT :25 | PASS |
| No public ACCEPT mail ports | PASS |
| JMAP discovery | PASS |
| JMAP auth + Mailbox/get | PASS |
| IMAPS login | PASS |
| SMTP submission auth (465) | PASS |
| Local delivery agent-test → archive | PASS |
| Service restart + post checks | PASS |
| Encrypted backup write + SHA-256 + decrypt | PASS |
| Public 25/465/587/993/8080 closed | PASS |

---

## Gmail smarthost + forward (human inbox)

**Goal:** mail that lands in `jhn@mail.fractavolta.com` (Twin) is **copied** to `jeanhuguesrobert@gmail.com` (Gmail UI). Public SMTP/MX on the `mail.fractavolta.com` subdomain also permits the Gmail → Twin return path; the apex remains served by Gandi.

**Why Gmail SMTP (465):** OCI blocks outbound port 25 to Google MX; `smtp.gmail.com:465` is reachable. Authenticated Gmail submission is the practical path.

### One-time secret (operator)

1. Google Account → Security → 2-Step Verification → **App passwords** → create one for Mail/Stalwart.
2. On fracta only (never paste into chat/git):

```bash
printf '%s' 'YOUR_16_CHAR_APP_PASSWORD' | tr -d ' ' \
  | sudo tee /srv/cogentia/secrets/stalwart-gmail-app-password >/dev/null
sudo chown root:root /srv/cogentia/secrets/stalwart-gmail-app-password
sudo chmod 600 /srv/cogentia/secrets/stalwart-gmail-app-password
```

3. Apply config:

```bash
ssh fracta 'sudo /usr/local/sbin/stalwart-gmail-forward-setup.sh'
```

Related files on host:

| Path | Role |
|------|------|
| `/srv/cogentia/secrets/stalwart-gmail-app-password` | Operator source (single line, `600 root:root`) |
| `/etc/stalwart/secrets/gmail-app-password` | Service-readable runtime copy (`640 root:stalwart`; managed by the setup script) |
| `/srv/cogentia/secrets/stalwart-gmail-relay.env` | Non-secret knobs: user, host, port, forward-to |

Script (versioned): `scripts/ops/stalwart-gmail-forward-setup.sh`

### Behaviour after apply

| Item | Behaviour |
|------|-----------|
| Outbound route | local domain → local store; **else → `gmail-relay`** (`smtp.gmail.com:465` + app password) |
| Sieve system | for `jhn@mail.fractavolta.com`: `redirect :copy` → Gmail (keeps Twin copy) |
| Human UI | Gmail unchanged |
| Yahoo→Gmail | already operator-managed; orthogonal |

### Test

```bash
# From agent-test to jhn (private SMTP submission on fracta)
ssh fracta 'sudo /usr/local/sbin/stalwart-phase2-tests.py'   # still valid for private path
# Then check Gmail for subjects from Twin tests / gmail-forward-test
```

### Public inbound verification (2026-07-27)

The first end-to-end message, `Premier message Gmail vers Twin JHN`, verified:

- Gmail connected from a Google MTA to public TCP 25;
- TLS 1.3 negotiated;
- reverse-DNS, SPF, DKIM and DMARC checks passed;
- Stalwart ingested the message into account `jhn@mail.fractavolta.com`;
- the Sieve copy was relayed through authenticated Gmail SMTP and accepted with
  SMTP `250`;
- Gmail kept the original in `SENT` and deduplicated the returned copy with the
  same `Message-ID`.

The generated self-signed certificate fallback was removed on 2026-07-27.
Stalwart now serves Caddy's Let's Encrypt certificate
for `mail.fractavolta.com` as its default certificate. Public verification
returns hostname verification OK, TLS 1.3, and OpenSSL verify code `0`.

Certificate renewal propagation is automatic:

- `/usr/local/sbin/stalwart-sync-caddy-cert.sh` validates SAN, expiry and
  certificate/key matching before copying;
- `stalwart-cert-sync.timer` checks hourly with randomized delay;
- Stalwart restarts only when the certificate or key changed;
- the timer is enabled and persistent.

---

## Explicitly deferred or still pending

- **PTR** / reverse DNS
- **SPF / DKIM / DMARC** for public reputation of `mail.fractavolta.com` as an Internet sender
- Public 465/993 (remain private)
- Internet deliverability / bulk outbound as a public MTA
- Second Twin in production
- Capable-host migration if RAM pressure grows

---

## Related Operium files

| Path | Role |
|------|------|
| `docs/stalwart-private-mail.md` | This runbook |
| `templates/stalwart/` | Caddy fragment, env example, backup units, logrotate, plan example |
| `scripts/ops/stalwart-backup.sh` | Encrypted backup |
| `scripts/ops/stalwart-restore.sh` | Restore |
| `scripts/ops/stalwart-phase2-tests.py` | Private test suite |
| `scripts/ops/fracta-stalwart-phase1*.sh` | Phase 1 install aids |
