---
title: "Cogentia MCP for coding agents"
document_role: source
document_kind: operational
visibility: private
lifecycle_state: active
last_updated: "2026-07-23"
related:
  - "coding-infrastructure.md"
  - "cogentia-semantic-stack.md"
  - "../decisions/views-store-caddy-service.md"
---

# Cogentia MCP for coding agents

Operium coordinates **where agents run and how secrets are loaded**. The
**canonical MCP contract** lives in Cogentia:

| Doc | Role |
|------|------|
| [cogentia/docs/connect-mcp-clients.md](https://github.com/JeanHuguesRobert/cogentia/blob/main/docs/connect-mcp-clients.md) | How to wire Claude, Codex, Cursor, HTTP, Fracta |
| [cogentia/docs/cogentia-mcp.md](https://github.com/JeanHuguesRobert/cogentia/blob/main/docs/cogentia-mcp.md) | Adapter design (thin; daemon-only) |
| [cogentia/docs/views-store.md](https://github.com/JeanHuguesRobert/cogentia/blob/main/docs/views-store.md) | Views Store API + corpus-state |

## Principle

- **Logic:** `cogentia.js` + daemon  
- **Adapter:** MCP stdio/HTTP (light)  
- **Human cockpit:** https://cogentia.fractavolta.com/  
- **Agent bootstrap tool:** `cogentia_views_snapshot` → `GET /api/views/snapshot`

Do not re-implement corpus logic inside Operium or inside MCP.

## Local checklist

1. Registry + data dir  
2. Daemon: `node scripts/cogentia.js daemon --host 127.0.0.1 --port 8790`  
3. MCP: `node scripts/cogentia-mcp.js` (started by the coding agent)  
4. First tool call: `cogentia_views_snapshot`

## Agent-specific config

Copy stanzas from **connect-mcp-clients.md** (Codex TOML, Claude/Cursor JSON).
Launchers under `C:/tweesic/*.bat` (see [coding-infrastructure.md](coding-infrastructure.md))
do not automatically inject MCP; each agent product has its own MCP config file.

## Public Fracta

- MCP HTTP: `https://cogentia.fractavolta.com/mcp`  
- Tools smoke: `https://cogentia.fractavolta.com/tools`  
- Views: `https://cogentia.fractavolta.com/`  

Public surface is **read-only / public view** (`COGENTIA_MCP_VIEW=public`). As of cogentia Phase 3 (mcp **0.5.0**):

- `tools/list` exposes **21** tools (mutate tools still hidden; +agent_start, skill_list/get, continuation_schema).
- `tools/call` returns **packet-shaped** results (`cogentia.mcp_tool_result/v1`: citations, continuation, skill_hint, error_class, correlation).
- `cogentia_skill_get id=continuation-handling` returns full method markdown without a git checkout.
- `cogentia_continuation_list` / `inspect` hit real daemon routes.
- Mutate (`emit` / `resolve` / `issues_sync`) requires full view + admin token + `COGENTIA_MCP_ALLOW_MUTATE=1` — **not** set on Fracta public.

Deploy (app tree on node):

```bash
ssh fracta
cd /srv/cogentia/repos/cogentia && git pull --ff-only origin main
sudo systemctl restart cogentia.service mcp-cogentia.service
```

**Later (not initial):** Netlify Edge (Deno) adapter — same MCP contract, edge-side projection; Fracta remains daemon home. See cogentia `docs/cogentia-js-mcp-agent-path.md` § Deployment topology.
