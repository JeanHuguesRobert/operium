---
document_role: "source"
document_kind: "operational"
visibility: "private"
last_updated: "2026-07-20"
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

**Last verified:** 2026-07-20
**Status:** ✅ All systems operational

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    C:/tweesic/                              │
│                                                              │
│  Launchers Layer (User Interface)                           │
│  ├── claude-zai.bat          ──► Z.AI (GLM) direct         │
│  ├── claude-anthropic.bat    ──► Anthropic direct          │
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
│              Inseme Vault (Secrets Layer)                    │
│              C:/tweesic/inseme/.env                          │
│                                                              │
│  ZAI_API_KEY          → api.z.ai                             │
│  ANTHROPIC_API_KEY    → api.anthropic.com                    │
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

### Claude Code (Direct Configuration)

| Launcher | Provider | Base URL | Config Location |
|----------|----------|----------|-----------------|
| `claude-zai.bat` | Z.AI (GLM) | api.z.ai/api/anthropic | ~/.claude/settings.json |
| `claude-anthropic.bat` | Anthropic | api.anthropic.com | ~/.claude/settings.json |
| `claude-status.bat` | — | — | Shows current config |

**Usage:**
```bash
cd C:/tweesic
.\claude-zai.bat          # Switch to Z.AI
.\claude-anthropic.bat    # Switch to Anthropic
.\claude-status.bat       # Show current
```

**⚠️ Important:** After switching, **restart Claude Code** for changes to take effect.

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
| `get-api-keys.js` | inseme/apps/platform/scripts/ | Read keys from vault |
| `sync-secrets.js` | inseme/apps/platform/scripts/ | Sync all secrets |
| `tailscale-rsync-secrets.js` | inseme/apps/platform/scripts/ | Multi-machine sync |

**Usage:**
```bash
# Show all keys (masked)
cd C:/tweesic/inseme
node apps/platform/scripts/get-api-keys.js

# Get specific key
node apps/platform/scripts/get-api-keys.js --key zai_api_key --quiet

# Sync secrets
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

3. **Add secret key to vault:** Edit `C:/tweesic/inseme/.env`

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
- Check key exists: `node inseme/apps/platform/scripts/get-api-keys.js --key <key>`
- Verify in `.env`: `grep <KEY> inseme/.env`

**Claude Code not switching:**
- Run launcher: `.\claude-zai.bat` or `.\claude-anthropic.bat`
- **Restart Claude Code** (required!)

## Health Status

| Component | Status | Notes |
|-----------|--------|-------|
| Launchers | ✅ Operational | All tested |
| Command Code | ✅ v0.52.1 | 43 models available |
| Secret vault | ✅ Functional | Inseme .env |
| Local agents | ✅ AGY working | Sovereign/Magistral configured |
| Multi-machine sync | ✅ Tailscale | scripts available |

## Related Documentation

- `secrets-management.md` — Secret architecture and sync
- `cogentia-agent-indexing-roadmap.md` — Agent indexing strategy
- `workstation-tooling-debt-and-profiles.md` — Tool inventory

## Change Log

| Date | Change |
|------|--------|
| 2026-07-20 | Initial documentation, verified all launchers |
| 2026-07-19 | Command Code installation, Muse Spark discovery |
