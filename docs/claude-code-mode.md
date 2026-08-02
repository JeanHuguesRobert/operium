---
document_role: "source"
document_kind: "operational"
visibility: "private"
last_updated: "2026-07-27"
owner: Operium
health:
  score: 4
  status: "functional"
  reasons:
    - "claude-mode owned by Operium; pro vs zai modes implemented."
    - "Local workstation apply path verified via scripts/ops/claude-mode.js."
    - "Mesh apply via apply-claude-mode-nodes.ps1 (Tailscale SSH)."
  next_actions:
    - "Run claude auth login on each interactive host after first pro switch if OAuth expired."
    - "Recharge z.ai before using zai mode in production sessions."
related:
  - "secrets-management.md"
  - "coding-infrastructure.md"
  - "fractanet-mesh.md"
  - "workstation-tooling-debt-and-profiles.md"
---

# Claude Code mode (pro ↔ z.ai)

**Owner:** Operium (desired-state + apply procedure + health).  
**Not owned by:** application repos as a second control plane.

## Intent

Claude Code supports third-party / external backends on purpose via:

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_AUTH_TOKEN` (or API key)

Operium standardizes **two** interactive modes on Fractanet nodes that run Claude Code:

| Mode | Backend | Auth | When |
|------|---------|------|------|
| **`pro`** | `api.anthropic.com` (default) | **claude.ai OAuth** (Pro subscription) — *not* a Console API key | Default for human coding sessions |
| **`zai`** | `https://api.z.ai/api/anthropic` | `ZAI_API_KEY` from workstation SoT (`inseme/.env`) | GLM / long-horizon when z.ai balance is funded |

Optional future mode `api` (Console key) is **not** installed: no desire for Console keys on this fleet.

## Source of truth

| Concern | Authority |
|---------|-----------|
| Which mode a human session should use | Operator choice + this doc |
| `ZAI_API_KEY` value | **`inseme/.env`** (workstation FS SoT) → vault optional for edge |
| Pro / OAuth session | Per-machine `~/.claude/.credentials.json` after `claude auth login` |
| Written runtime copy | Per-machine `~/.claude/settings.json` (not git) |
| Apply tool | **`operium/scripts/ops/claude-mode.js`** |

## Commands

### Local (any node with Operium checkout)

```bash
node operium/scripts/ops/claude-mode.js status
node operium/scripts/ops/claude-mode.js doctor
node operium/scripts/ops/claude-mode.js pro
node operium/scripts/ops/claude-mode.js zai
```

Windows workspace wrappers (thin):

```powershell
# Select the backend, then start a new Claude Code session.
C:\tweesic\claude-pro.bat
claude

C:\tweesic\claude-zai.bat
claude
```

The equivalent interactive Unix-shell functions (`claude-pro`, `claude-zai`)
are provided by the Operium Termux and Fracta VPS shell profiles. They select
the mode only; run `claude` afterwards. Refresh the profile on each node with
its corresponding `profiles/shell/install-*-shell-profile.sh` script.

### Mesh apply (Fractanet)

From the trusted workstation (Tailscale SSH aliases):

```powershell
# Observe
.\operium\scripts\ops\apply-claude-mode-nodes.ps1 -Mode doctor

# Switch all listed Claude hosts to Pro OAuth mode (clears z.ai overrides)
.\operium\scripts\ops\apply-claude-mode-nodes.ps1 -Mode pro

# Dry-run z.ai
.\operium\scripts\ops\apply-claude-mode-nodes.ps1 -Mode zai -CheckOnly
```

Default remote node list targets **interactive coding hosts** (e.g. ThinkPad).  
**fracta** public VPS is *not* a default Claude Code host (Guide / control plane role).

## Per-mode behaviour

### `pro`

1. Removes `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` from `~/.claude/settings.json`.
2. Leaves OAuth credentials untouched.
3. Sets marker `operium_claude_mode: "pro"`.
4. Operator must ensure valid login: `claude auth login` if `doctor` reports `oauth_expired`.

### `zai`

1. Resolves `ZAI_API_KEY` from (in order): process env → `INSEME_ENV_PATH` → `TWEESIC_ROOT/inseme/.env` → common node paths.
2. Writes token + `ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic`.
3. Marker `operium_claude_mode: "zai"`.
4. Requires funded z.ai package (`doctor` classifies HTTP 429 / code 1113 as `zai_insufficient_balance`).

## Doctor classifications

| Probe | Classification | Meaning |
|-------|----------------|---------|
| oauth | `ok` | Pro token works |
| oauth | `oauth_expired` | Re-run `claude auth login` |
| oauth | `not_logged_in` | Never logged in on this node |
| zai | `ok` | Proxy + balance OK |
| zai | `zai_insufficient_balance` | Recharge z.ai |
| zai | `no_key` | SoT missing `ZAI_API_KEY` |

## Security

- Never commit `settings.json` tokens or `.credentials.json`.
- Pro path must **not** require `ANTHROPIC_API_KEY` in Inseme.
- `anthropic_api_key` in the vault catalog is **legacy / unused** for this mode design; prefer OAuth for interactive Claude Code.
- Mesh apply uses Tailscale SSH only (see `fractanet-mesh.md`).

## Convenience wrappers

| Wrapper | Effect |
|---------|--------|
| `claude-pro.bat` / `.ps1` | `claude-mode pro` (OAuth, not Console key) |
| `claude-zai.bat` / `.ps1` | `claude-mode zai` |
| Unix `claude-pro` / `claude-zai` | Same modes through the Operium shell profile |

Retired compatibility name:

| Old | New |
|-----|-----|
| `claude-anthropic.bat` / `.ps1` | `claude-mode pro` (OAuth, not Console key) |
| `claude-status.bat` / `.ps1` | `claude-mode status` |

## Related

- [secrets-management.md](secrets-management.md) — SoT vs runtime copies  
- [coding-infrastructure.md](coding-infrastructure.md) — broader agent inventory  
- [fractanet-mesh.md](fractanet-mesh.md) — node roles / SSH aliases  
