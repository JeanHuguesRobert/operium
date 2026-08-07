---
document_role: "source"
document_kind: "operational"
visibility: "private"
last_updated: "2026-08-07"
owner: Operium
health:
  score: 4
  status: "functional"
  reasons:
    - "Dual authority model documented (workstation FS vs edge vault)."
    - "COGENTIA_API_KEY mapped to vault."
    - "Single apply/verify entry point for system bearer runtime copies (OP-BUG-002)."
  next_actions:
    - "Use apply-system-bearer after every COGENTIA_API_KEY change."
    - "Add rotation schedule for critical provider keys."
    - "Optional age encryption for offline backups."
---

# Secrets Management

**Owner:** Operium (operational registry, apply procedures, health).  
**Values never live in this repo** — only names, authorities, and procedures.

## Overview

This registry tracks API keys, tokens, and other secrets across the Cogentia /
Inseme / Fractanet operational surface.

**This file is the operational authority** for secret names, dual authority,
rotation, and apply procedures. July 2026 research drafts
([`research/secrets-architecture-2026-07.md`](../research/secrets-architecture-2026-07.md),
[`research/secrets-sovereign-architecture.md`](../research/secrets-sovereign-architecture.md))
are **historical** — useful for options (age, SOPS, platform APIs) but not for
live rotation. See research index “Secrets” section (OP-BUG-005).

## Architecture

### Dual authority (why two “sources of truth”)

| Surface | Authority | Why |
|---------|-----------|-----|
| Workstation processes, Magistral host env, Agent CLI Gateway host env | **`inseme/.env`** (FS) | Human-editable SoT on the trusted workstation; operators and local daemons can load dotenv |
| **Inseme edge functions** (Supabase / Netlify / platform edge) | **`instance_config` vault** (`is_secret=true`) | Edge has **no filesystem** access to `inseme/.env`; vault is the only runtime config plane |

**Rule:** change secrets in `inseme/.env` first, then push vault
(`sync-secrets.js --apply --vault`). Runtime **copies** on nodes (see below)
are not authorities — if a copy must diverge, put a comment above the override.

### Sources of Truth vs copies

| Location | Type | Purpose |
|----------|------|---------|
| `inseme/.env` | **Workstation FS authority** | Operator SoT for secrets used by local tools and for seeding vault / node copies |
| Inseme Vault (`instance_config`) | **Edge authority** | Canonical for edge functions / multi-instance platform config |
| `/etc/cogentia/magistral.env` | Runtime **copy** | `magistral.service` on fracta (`EnvironmentFile=`) |
| `~/.cogentia/secrets/agent-gateway.env` (ThinkPad) | Runtime **copy** | Agent CLI Gateway (`COGENTIA_API_KEY` + non-secret ops knobs) |
| `~/.claude/settings.json` | Per-machine | Claude Code only (not Cogentia system bearer) |

### Sync Flow

```
┌─────────────────────────────────────────────────────────────┐
│              inseme/.env  (workstation FS authority)         │
│              C:/tweesic/inseme/.env                          │
└─────────────────────────────────────────────────────────────┘
          │                              │
          │ sync-secrets --apply --vault │ manual / apply scripts
          ↓                              ↓
┌──────────────────────────┐   ┌──────────────────────────────────┐
│  instance_config vault   │   │  Runtime copies (not authority)  │
│  (edge authority)        │   │  /etc/cogentia/magistral.env     │
│  is_secret=true          │   │  ~/.cogentia/secrets/…           │
└──────────────────────────┘   └──────────────────────────────────┘
```

Optional mesh distribution of **file** copies (not vault):

```
tailscale-rsync-secrets.js  →  Rossignol · ThinkPad · Cloud backup
```

## Secret Catalog

### Active Secrets

| Vault Key | .env Variable | Purpose | Provider | Rotation | Notes |
|-----------|---------------|---------|----------|----------|-------|
| **`cogentia_api_key`** | **`COGENTIA_API_KEY`** | Shared system bearer: Magistral coding nodes ↔ Agent CLI Gateway (Guide synthesis path) | Operium / Cogentia | On compromise or scheduled | **Name only this key** — do **not** also store the same value as `AGENT_GATEWAY_TOKEN=` |
| `anthropic_api_key` | `ANTHROPIC_API_KEY` | **Legacy / unused for interactive Claude Code** — prefer claude.ai OAuth (`claude auth login`) | Anthropic Console | — | Do not require for `claude-mode pro` |
| `zai_api_key` | `ZAI_API_KEY` | Claude Code **zai** mode (GLM proxy) | z.ai | As needed | Written into `~/.claude/settings.json` only when mode=zai |
| `openai_api_key` | `OPENAI_API_KEY` | Embeddings, GPT-4 fallback | OpenAI | Quarterly | .env + vault |
| `gemini_api_key` | `GEMINI_API_KEY` | Google AI | Google | As needed | .env (current) |
| `github_token` | `GITHUB_TOKEN` | GitHub operations | GitHub | As needed | .env (current) |
| `supabase_service_role_key` | `SUPABASE_SERVICE_ROLE_KEY` | Inseme backend / vault writes | Supabase | Annually | Never auto-push casually |
| `cloudflare_tunnel_token` | `CLOUDFLARE_TUNNEL_TOKEN` | Tunnel access | Cloudflare | Annually | .env (current) |

### `COGENTIA_API_KEY` (system bearer) — Operium responsibility

- **Product path:** Guide → Cogentia → Magistral → Agent CLI Gateway (see
  [magistral-coding-agent-routing.md](magistral-coding-agent-routing.md)).
- **Env name:** `COGENTIA_API_KEY` only (storage). Code may still **read** legacy
  `AGENT_GATEWAY_*` aliases during migration — that is not a second secret.
- **Vault key:** `cogentia_api_key` (mapped in
  `inseme/apps/platform/scripts/sync-secrets.js` and `lib/config.js`).
- **Who consumes it:**
  - Magistral process env on fracta (`apiKeyEnv: "COGENTIA_API_KEY"` in map).
  - Agent CLI Gateway on tool hosts (bearer check).
  - Edge code that must call Cogentia surfaces without FS (via vault).
- **Who does *not* use it:** end-user browser sessions; public Guide pages
  (server-side only).

### Per-Machine Locations

| Machine | Path | Last Sync |
|---------|------|-----------|
| Rossignol (Corte) | `/c/tweesic/inseme/.env` | 2026-07-19 |
| fracta | `/srv/cogentia/repos/inseme/.env` | 2026-07-28 |
| poco-jhr (Android / Termux) | `~/srv/cogentia/repos/inseme/.env` | 2026-07-28 |
| ThinkPad (Portable) | `~/tweesic/inseme/.env` | TBD |
| Cloud Backup | `~/backups/tweesic/inseme/.env` | TBD |

## Tools

### apply-system-bearer.js (OP-BUG-002 entry point)

**Location:** `operium/scripts/ops/apply-system-bearer.js`  
**Library:** `operium/lib/system-bearer.js`

Single procedure for the shared system bearer (`COGENTIA_API_KEY`): verify SoT,
align the ThinkPad gateway runtime copy, optionally push vault, and print a
restart/smoke checklist. **Dry-run by default. Never prints secret values.**

```bash
cd operium
node scripts/ops/apply-system-bearer.js              # dry-run JSON (exit 1 on drift)
node scripts/ops/apply-system-bearer.js --human
node scripts/ops/apply-system-bearer.js --apply      # write ~/.cogentia/secrets/agent-gateway.env
node scripts/ops/apply-system-bearer.js --apply --vault   # + inseme sync-secrets --apply --vault
node scripts/ops/apply-system-bearer.js --fracta-host fracta
```

| Step | Behaviour |
|------|-----------|
| SoT | Read `inseme/.env` (or `OPERIUM_SECRET_SOT`) |
| Gateway copy | Compare/write `~/.cogentia/secrets/agent-gateway.env` via atomic key sync |
| Vault | Only with `--apply --vault` (double opt-in → `sync-secrets.js`) |
| fracta magistral | Planned + `publish-inseme-env-to-fracta.ps1` helper (not silent SSH write) |
| Restarts / smoke | Checklist only unless operator runs host restarts |

Low-level single-key helper (used internally and for ad-hoc copies):
`scripts/ops/sync-env-key.js --source <env> --target <env> --key NAME`.

### sync-secrets.js

**Location:** `inseme/apps/platform/scripts/sync-secrets.js`

Dry-run by default. Scans drift vs `inseme/.env` (SoT). Vault writes require
**double opt-in** `--apply --vault`. Prefer calling this via
`apply-system-bearer.js --apply --vault` when rotating the system bearer.

```bash
cd inseme/apps/platform
node scripts/sync-secrets.js                 # dry-run report only
node scripts/sync-secrets.js --apply         # merge into inseme/.env only
node scripts/sync-secrets.js --apply --vault # SoT → instance_config (edge authority)
```

### get-api-keys.js

**Location:** `inseme/apps/platform/scripts/get-api-keys.js`

Reads API keys from vault.

```bash
node apps/platform/scripts/get-api-keys.js
node apps/platform/scripts/get-api-keys.js --key anthropic_api_key
```

### tailscale-rsync-secrets.js

**Location:** `inseme/apps/platform/scripts/tailscale-rsync-secrets.js`

Syncs secrets across Tailscale mesh machines.

```bash
node apps/platform/scripts/tailscale-rsync-secrets.js --dry-run
node apps/platform/scripts/tailscale-rsync-secrets.js --push
node apps/platform/scripts/tailscale-rsync-secrets.js --pull
```

### encrypt-secrets.js (age encryption)

**Location:** `inseme/apps/platform/scripts/encrypt-secrets.js`

Encrypt/decrypt secrets using age (age-encryption.org) for Git storage.

**Requirements:**
- `age` CLI tool: `winget install age` (Windows) or `brew install age` (macOS)

```bash
# Generate age key pair
node apps/platform/scripts/encrypt-secrets.js keygen

# Encrypt .env to .env.age (commit .env.age to Git)
node apps/platform/scripts/encrypt-secrets.js encrypt

# Decrypt .env.age to .env (run on machine setup)
node apps/platform/scripts/encrypt-secrets.js decrypt
```

**Workflow:**
1. Generate key pair once: `keygen`
2. Keep private key secure (never commit to Git)
3. Encrypt secrets: `encrypt` → commit `.env.age`
4. On new machine: clone repo, run `decrypt`

## Claude Code mode (Operium-owned)

**Canonical:** [`docs/claude-code-mode.md`](claude-code-mode.md) · `scripts/ops/claude-mode.js`

| Command | Purpose | Auth / secret |
|---------|---------|----------------|
| `claude-mode pro` | Official Claude via **claude.ai OAuth** (Pro) | `~/.claude/.credentials.json` — **no** Console API key |
| `claude-mode zai` | z.ai GLM Anthropic-compatible proxy | `ZAI_API_KEY` from `inseme/.env` → `~/.claude/settings.json` |
| `claude-mode status` / `doctor` | Observe / probe | No secret output |

Workstation wrappers: `C:/tweesic/claude-mode.bat` (thin).  
Mesh: `scripts/ops/apply-claude-mode-nodes.ps1`.

## Security Posture

### Trust Model

- **Tailscale:** Considered trustable (private mesh, authenticated peers)
- **GitHub:** NOT trustable for secrets (public repo)
- **Supabase:** Trustable for non-critical secrets (production-ready DB)
- **Local .env:** Trustable if machine is secure

### Hygiene Rules

1. **NEVER commit** secrets to Git (public or private)
2. **ALWAYS sync** via Tailscale (rsync/scp/rclone), not Git
3. **ROTATE quarterly** for critical keys (Anthropic, OpenAI, GitHub)
4. **AUDIT monthly** for stale/unused keys
5. **REVOKE immediately** any exposed key

### Git Ignore Pattern

Ensure `.gitignore` includes:
```gitignore
.env
.env.*
*.key
*.pem
.secrets/
```

## Operational Procedures

### Adding a New Secret

1. Add to `inseme/.env` locally (`KEY=value`, no spaces around `=`).
2. If edge needs it: ensure vault mapping exists (`VAULT_KEY_MAPPING` /
   `ENV_KEY_MAPPING` in platform scripts), then
   `node scripts/sync-secrets.js --apply --vault`.
3. Refresh any **runtime copies** that load the key (magistral.env, gateway
   host env, app envs).
4. Document in this file (Secret Catalog table). Values never in git.

### Rotating `COGENTIA_API_KEY` (system bearer)

1. Choose a new value (operator-generated; not a third-party dashboard key).
2. Set **only** `COGENTIA_API_KEY=<new>` in `inseme/.env`. Remove any
   `AGENT_GATEWAY_TOKEN=` line if present.
3. From Operium (dry-run first, then apply):

```bash
cd operium
node scripts/ops/apply-system-bearer.js --human
node scripts/ops/apply-system-bearer.js --apply --vault --human
```

4. Publish FS authority to fracta when the VPS must match:

```powershell
pwsh -File scripts/ops/publish-inseme-env-to-fracta.ps1
```

5. Restart consumers:
   - ThinkPad: Agent CLI Gateway (scheduled task / ONA)
   - fracta: `sudo systemctl restart magistral` (and ONA if it cached the bearer)
6. Smoke: gateway `health?quick=1` with `Authorization: Bearer <new>`; Guide
   conversational path; no 401 on coding-agent hop.
7. Do not leave the old value under a second env name “for compatibility”.

Helpers: `scripts/ops/apply-system-bearer.js` (orchestrator),
`scripts/ops/sync-env-key.js` (single-key file), optional
`cogentia/scripts/ops/set-cogentia-api-key-host.ps1`.

### Rotating a provider secret (OpenAI, Anthropic, …)

1. Generate new key in provider dashboard.
2. Update `inseme/.env` locally.
3. `node scripts/sync-secrets.js --apply --vault` when edge or vault consumers
   need it.
4. Refresh node copies / restart services that load the key.
5. Test on one surface before revoking the old key.
6. Revoke old key in provider dashboard.

### Emergency Revocation

1. Revoke or invalidate immediately (provider dashboard or rotate system bearer).
2. Clear/update `inseme/.env` on the authority workstation.
3. Push vault (`--apply --vault`) so edge does not keep the old value.
4. Update all runtime copies and restart consumers.

## Incidents

| Date | Issue | Resolution | Postmortem |
|------|-------|------------|------------|
| 2026-07-28 | `GITHUB_TOKEN` in the FS authority returned HTTP 401 on Fracta | Authenticated `gh` from the workstation native credential store; `.env` refresh remains due | Verify a provider credential after propagation; do not confuse file equality with provider validity |
| TBD | Example placeholder | N/A | N/A |

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Key leak via GitHub | High | Git hooks, pre-commit checks |
| Single machine failure | Medium | Tailscale sync to multiple machines |
| Supabase breach | Medium | Local .env copies, rotation policy |
| Tailscale breach | Low | Mesh auth, key rotation |

## Related Documents

- [Magistral → coding-agent routing](magistral-coding-agent-routing.md) — who
  consumes `COGENTIA_API_KEY` on the Guide path
- [Fracta trust perimeter](fracta-trust-perimeter.md)
- [Operational Health](operational-health.md)
- [Coding infrastructure](coding-infrastructure.md)
- Decision: [magistral-coding-agent-routing ADR](../decisions/magistral-coding-agent-routing.md)
- App boundary (Inseme): `inseme/packages/models/docs/fracta-magistral-openai.md`
