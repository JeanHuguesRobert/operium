---
title: "Cogentia MCP for coding agents"
document_role: source
document_kind: operational
visibility: private
lifecycle_state: active
last_updated: "2026-08-22"
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

Public surface is **read-only / public view** (`COGENTIA_MCP_VIEW=public`) for **anonymous** callers. As of Cogentia MCP **0.9.0** (2026-08-22):

- `server/discover` advertises MCP **2026-07-28** capabilities: `tools`, `resources`, `prompts`, `completions`, and experimental `io.modelcontextprotocol/skills` (SEP-2640).
- Anonymous `tools/list` is on the order of **~50** read tools (mutate hidden). This is **not** the maximum set — use `resources/list`, `skills/list`, `cogentia_pattern_list`, and `cogentia_cli_catalog`.
- `tools/call` returns **packet-shaped** results (`cogentia.mcp_tool_result/v1`).
- HTTP MCP (`mcp-cogentia`) uses the **registry-aware** core (same catalog as stdio, including Registry Graph tools).
- Inseme hub (`inseme-mcp`) **imports this catalog**; it must not keep a parallel Cogentia tool table.
- **Agent JHN write path (optional):** if operator sets on `mcp-cogentia`:

```ini
# /etc/systemd/system/mcp-cogentia.service.d/jhn-mutate.conf  (host only — not git)
[Service]
Environment=COGENTIA_MCP_JHN_MUTATE=1
Environment=COGENTIA_MCP_JHN_TOKEN=<from vault / guide.env — never commit>
```

  then requests with `Authorization: Bearer <token>` and `X-Cogentia-Actor: agent:jhn` (or `agent:jhn.subagent:…`) see and may call mutate tools. Subagents under JHN share the same token + actor claim. Skills do **not** grant write.
- Mutate also still available via full view + admin + `COGENTIA_MCP_ALLOW_MUTATE=1`.
- Sandbox: `cogentia/sandbox/mcp-2026-cognitive-packet/` (`npm run test:mcp-sandbox`).

Deploy (app tree on node):

```bash
ssh fracta
cd /srv/cogentia/repos/cogentia && git pull --ff-only origin main
sudo systemctl restart cogentia.service mcp-cogentia.service
# Optional: keep Inseme checkout aligned (hub catalog; not a systemd unit)
# cd /srv/cogentia/repos/inseme && git pull --ff-only origin main
```

Post-deploy smoke and catalog invariants: [mcp-capability-surface.md](mcp-capability-surface.md).

**Later (not initial):** Netlify Edge (Deno) adapter — same MCP contract, edge-side projection; Fracta remains daemon home. See cogentia `docs/cogentia-js-mcp-agent-path.md` § Deployment topology.
