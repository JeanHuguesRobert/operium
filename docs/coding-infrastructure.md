---
document_role: "source"
document_kind: "operational"
visibility: "private"
last_updated: "2026-07-27"
health:
  score: 4
  status: "functional"
  reasons:
    - "All launchers operational and tested"
    - "Command Code integrated with 43 models"
    - "Secret management via Inseme vault"
related:
  - "secrets-management.md"
  - "../inseme/apps/platform/scripts/lib/config.js"
---

# Coding Infrastructure - Operational Documentation

## Overview

Complete inventory of coding AI agents operational on the workstation, their launchers, and integration architecture.

**Last verified:** 2026-07-27  
**Status:** Claude mode switch owned by Operium (`claude-mode`); multi-model cmdc launchers separate.  

**Claude Code backends:** see [claude-code-mode.md](claude-code-mode.md) (`pro` OAuth vs `zai` proxy).

### Cogentia MCP (agent corpus access)

Coding agents that support MCP should use the **thin Cogentia MCP adapter**
(`cogentia/scripts/cogentia-mcp.js`), not a second corpus implementation.

- **Bootstrap tool:** `cogentia_views_snapshot` (alive work + corpus signals + view URLs)  
- **Recipes:** [cogentia/docs/connect-mcp-clients.md](https://github.com/JeanHuguesRobert/cogentia/blob/main/docs/connect-mcp-clients.md)  
- **Operium pointer:** [cogentia-mcp-clients.md](cogentia-mcp-clients.md)  
- **Requires:** local daemon on `127.0.0.1:8790` (or Fracta public `https://cogentia.fractavolta.com/mcp`)  

CLI without MCP: `node cogentia/scripts/cogentia.js --json views snapshot`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    C:/tweesic/                              │
│                                                              │
│  Launchers Layer (User Interface)                           │
│  ├── claude-mode.bat         ──► Operium pro|zai|status    │
│  ├── cmdc.bat                ──► Command Code (multi-model)│
│  ├── muse.bat                ──► Muse Spark via cmdc        │
│  ├── grok.bat                ──► Grok via cmdc             │
│  ├── gemini.bat              ──► Gemini via cmdc            │
│  ├── kimi.bat                ──► Kimi via cmdc              │
│  └── glm.bat                 ──► GLM via cmdc              │
└──────────────────────────┬────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              Inseme SoT + per-tool auth                      │
│              C:/tweesic/inseme/.env                          │
│                                                              │
│  ZAI_API_KEY          → claude-mode zai → api.z.ai           │
│  (Pro Claude)         → claude auth login (OAuth, no key)    │
│  GROK_API_KEY         → api.x.ai                             │
│  GEMINI_API_KEY       → googleapis.com                       │
│  META_API_KEY         → api.meta.com (future)                │
└──────────────────────────┬────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    Provider APIs                             │
│                                                              │
│  Cloud: Anthropic, xAI, Google, Meta, Z.AI                  │
│  Local: AGY (Antigravity), Sovereign, Magistral             │
└─────────────────────────────────────────────────────────────┘
```

## Launchers Reference

### Claude Code (Operium `claude-mode`)

| Command | Provider | Auth | Config |
|---------|----------|------|--------|
| `claude-mode pro` | Anthropic official | claude.ai **OAuth / Pro** | clears proxy env in `~/.claude/settings.json` |
| `claude-mode zai` | Z.AI (GLM) | `ZAI_API_KEY` | sets base URL + token in settings |
| `claude-mode status` / `doctor` | — | — | observe / probe |

**Canonical script:** `operium/scripts/ops/claude-mode.js`  
**Doc:** [claude-code-mode.md](claude-code-mode.md)

**Usage:**
```bash
cd C:/tweesic
.\claude-mode.bat status
.\claude-mode.bat doctor
.\claude-mode.bat pro          # Pro OAuth (not Console API key)
.\claude-mode.bat zai          # Z.AI GLM
```

**⚠️ Important:** After `pro`/`zai`, **restart Claude Code**. If doctor reports `oauth_expired`, run `claude auth login`.

### Command Code (Multi-Model Interface)

**Location:** `C:/tweesic/cmdc.bat` → `%USERPROFILE%\.npm-global\cmdc.cmd`

**Version:** v0.52.1
**Models supported:** 43

| Launcher | Model | Provider | Best For |
|----------|-------|----------|----------|
| `muse.bat` | meta/muse-spark-1.1 | Meta | Agentic tasks, tool use, computer vision |
| `grok.bat` | xai/grok-4.5 | xAI | Coding excellence, complex reasoning |
| `gemini.bat` | google/gemini-3.5-flash | Google | Parallel execution, speed |
| `kimi.bat` | moonshotai/Kimi-K3 | Moonshot | 1M token context, entire codebases |
| `glm.bat` | zai-org/GLM-5.2 | Z.AI | Long-horizon autonomous tasks |

**Usage:**
```bash
# Interactive mode (no args)
.\muse.bat

# Direct execution
.\muse.bat "explain this function"

# List all models
.\cmdc.bat --list-models

# Use specific model
.\cmdc.bat --model muse-spark-1.1 "prompt"
```

### Local Agents

| Agent | Command | Endpoint | Status |
|-------|---------|----------|--------|
| AGY (Antigravity) | `agy` | Local executable | ✅ Operational |
| Sovereign | localhost:8081 | Local HTTP | Configured |
| Magistral | localhost:8082 | Local HTTP | Configured |

**AGY Usage:**
```bash
# Interactive REPL
agy

# Direct execution
agy --print "your prompt"
```

## Secret Management

### Source of Truth

**Primary:** `C:/tweesic/inseme/.env`
**Fallback:** `C:/tweesic/survey/.env`

### Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `claude-mode.js` | operium/scripts/ops/ | Claude Code pro/zai switch + doctor |
| `sync-secrets.js` | inseme/apps/platform/scripts/ | Secrets SoT / vault |
| `tailscale-rsync-secrets.js` | inseme/apps/platform/scripts/ | Multi-machine sync |

**Usage:**
```bash
# Claude Code mode + health
node C:/tweesic/operium/scripts/ops/claude-mode.js doctor

# Secrets SoT
cd C:/tweesic/inseme
node apps/platform/scripts/sync-secrets.js
```

## Agent Selection Criteria

| Use Case | Recommended Agent | Rationale |
|----------|------------------|-----------|
| **Agentic orchestration** | Muse Spark 1.1 | Built for tool-use, planning |
| **Pure coding quality** | Grok 4.5 | Best-in-class for code |
| **Full codebase analysis** | Kimi K3 | 1M token context |
| **Speed/parallel tasks** | Gemini 3.5 Flash | Optimized for parallel execution |
| **Long-running tasks** | GLM 5.2 | Long-horizon autonomous coding |
| **Official support** | Claude (Anthropic) | Enterprise support, stability |
| **Local/offline** | AGY | No external dependency |

## Operational Procedures

### Adding a New Agent

1. **Verify model availability in cmdc:**
   ```bash
   .\cmdc.bat --list-models | grep <provider>
   ```

2. **Create launcher:** Copy existing `.bat` file, update model name

3. **Add secret:** Edit `C:/tweesic/inseme/.env`, then push vault if edge needs it
   (`sync-secrets.js --apply --vault`). See `secrets-management.md` for
   `COGENTIA_API_KEY` dual authority (FS vs vault).

4. **Test:**
   ```bash
   .\<new-launcher>.bat
   ```

5. **Update this document**

### Troubleshooting

**Launcher says "command not found":**
- Verify `cmdc` location: `dir %USERPROFILE%\.npm-global\cmdc.cmd`
- Reinstall: `npm i -g command-code@latest`

**API key errors:**
- Verify in `.env`: `Select-String -Path inseme/.env -Pattern '^[A-Z_]+='` (names only)
- For z.ai Claude: `claude-mode doctor` → look for `zai_insufficient_balance` / `no_key`

**Claude Code not switching:**
- Run: `.\claude-mode.bat pro` or `.\claude-mode.bat zai`
- **Restart Claude Code** (required!)
- Clear process env if needed: `Remove-Item Env:ANTHROPIC_AUTH_TOKEN, Env:ANTHROPIC_BASE_URL -ErrorAction SilentlyContinue`
- If pro mode fails inference: `claude auth login` (OAuth)

## Health Status

| Component | Status | Notes |
|-----------|--------|-------|
| claude-mode | ✅ Operium-owned | pro OAuth / zai proxy |
| Command Code | ✅ v0.52.1 | multi-model launchers |
| Secret SoT | ✅ Functional | `inseme/.env` + vault (see secrets-management.md) |
| Local agents | ✅ AGY working | Sovereign/Magistral configured |
| Multi-machine sync | ✅ Tailscale | apply-claude-mode-nodes.ps1 |

## Related Documentation

- `claude-code-mode.md` — pro ↔ z.ai desired-state and mesh apply
- `secrets-management.md` — Dual authority, catalog, `COGENTIA_API_KEY` rotation
- `magistral-coding-agent-routing.md` — Guide → Magistral → Agent Gateway
- `cogentia-agent-indexing-roadmap.md` — Agent indexing strategy
- `workstation-tooling-debt-and-profiles.md` — Tool inventory

## Change Log

| Date | Change |
|------|--------|
| 2026-07-20 | Initial documentation, verified all launchers |
| 2026-07-19 | Command Code installation, Muse Spark discovery |
