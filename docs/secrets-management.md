---
document_role: "source"
document_kind: "operational"
visibility: "private"
last_updated: "2026-07-19"
health:
  score: 3
  status: "functional"
  reasons:
    - "Secrets are scattered across multiple .env files and configs."
    - "No central secret rotation policy."
    - "Tailscale sync is manual."
  next_actions:
    - "Document all secret locations."
    - "Implement automated sync via Tailscale."
    - "Add rotation schedule for critical keys."
---

# Secrets Management

## Overview

This registry tracks API keys, tokens, and other secrets across the Cogentia corpus infrastructure.

## Architecture

### Sources of Truth

| Location | Type | Purpose | Health |
|----------|------|---------|--------|
| `inseme/.env` | Local copy | Working copy for inseme dev | 4 |
| Inseme Vault (Supabase) | Remote | Canonical storage for instance configs | 3 |
| `~/.claude/settings.json` | Per-machine | Claude Code configuration | 3 |
| Tailscale sync | Mesh | Distributed backup across machines | 2 |

### Sync Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Inseme .env (local)                      │
│              C:/tweesic/inseme/.env                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ sync-secrets.js
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Inseme Vault (Supabase)                         │
│         instance_config table (is_secret=true)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ tailscale-rsync-secrets.js
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Tailscale Mesh (Multiple machines)              │
│   Rossignol (Corte) · ThinkPad (Field) · Cloud (Backup)     │
└─────────────────────────────────────────────────────────────┘
```

## Secret Catalog

### Active Secrets

| Vault Key | .env Variable | Purpose | Provider | Rotation | Storage |
|-----------|---------------|---------|----------|----------|---------|
| `anthropic_api_key` | `ANTHROPIC_API_KEY` | Claude Code (default) | Anthropic | Quarterly | age (future) |
| `zai_api_key` | `ZAI_API_KEY` | Claude Code (GLM models) | z.ai | As needed | age (future) |
| `openai_api_key` | `OPENAI_API_KEY` | Embeddings, GPT-4 | OpenAI | Quarterly | .env (current) |
| `gemini_api_key` | `GEMINI_API_KEY` | Google AI | Google | As needed | .env (current) |
| `github_token` | `GITHUB_TOKEN` | GitHub operations | GitHub | As needed | .env (current) |
| `supabase_service_role_key` | `SUPABASE_SERVICE_ROLE_KEY` | Inseme backend | Supabase | Annually | .env (current) |
| `cloudflare_tunnel_token` | `CLOUDFLARE_TUNNEL_TOKEN` | Tunnel access | Cloudflare | Annually | .env (current) |

### Per-Machine Locations

| Machine | Path | Last Sync |
|---------|------|-----------|
| Rossignol (Corte) | `/c/tweesic/inseme/.env` | 2026-07-19 |
| ThinkPad (Portable) | `~/tweesic/inseme/.env` | TBD |
| Cloud Backup | `~/backups/tweesic/inseme/.env` | TBD |

## Tools

### sync-secrets.js

**Location:** `inseme/apps/platform/scripts/sync-secrets.js`

Scavenges secrets from all sources and syncs to Inseme vault.

```bash
node apps/platform/scripts/sync-secrets.js --dry-run
node apps/platform/scripts/sync-secrets.js
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

## Claude Code Launchers

**Location:** `C:/tweesic/`

| Script | Purpose | Reads From |
|--------|---------|------------|
| `claude-zai.ps1/.bat` | Switch to z.ai (GLM) | Vault via get-api-keys.js |
| `claude-anthropic.ps1/.bat` | Switch to Anthropic | Vault via get-api-keys.js |
| `claude-status.ps1/.bat` | Show current config | Local settings.json |

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

1. Add to `inseme/.env` locally
2. Run `sync-secrets.js` to sync to vault
3. Run `tailscale-rsync-secrets.js --push` to distribute
4. Document in this file (Secret Catalog table)

### Rotating an Existing Secret

1. Generate new key in provider dashboard
2. Update `inseme/.env` locally
3. Run `sync-secrets.js`
4. Run `tailscale-rsync-secrets.js --push`
5. Test on one machine before proceeding
6. Revoke old key in provider dashboard
7. Update last_rotation date in this file

### Emergency Revocation

1. Revoke key immediately in provider dashboard
2. Remove from `inseme/.env` on all machines
3. Run `sync-secrets.js` to clear from vault
4. Run `tailscale-rsync-secrets.js --push` to propagate removal

## Incidents

| Date | Issue | Resolution | Postmortem |
|------|-------|------------|------------|
| TBD | Example placeholder | N/A | N/A |

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Key leak via GitHub | High | Git hooks, pre-commit checks |
| Single machine failure | Medium | Tailscale sync to multiple machines |
| Supabase breach | Medium | Local .env copies, rotation policy |
| Tailscale breach | Low | Mesh auth, key rotation |

## Related Documents

- [Operational Health](operational-health.md)
- [Claude Launchers](../../CLAUDE_LAUNCHERS.md)
- [Inseme Configuration](../../inseme/README.md)
