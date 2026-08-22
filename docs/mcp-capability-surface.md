---
title: "MCP capability surface — desired state"
document_role: operational
document_kind: method
visibility: public
lifecycle_state: active
last_updated: "2026-08-22"
related:
  - "cogentia-mcp-clients.md"
  - "fracta-trust-perimeter.md"
  - "operium-cli.md"
---

# MCP capability surface — desired state

Operium records **where** the MCP projection runs and **what must remain true**
after a Fracta deploy. Cogentia owns the catalog implementation; Inseme
federates it; Operium does not fork a third tool table.

## Desired topology

```text
Internet
  → Caddy cogentia.fractavolta.com  (paths /mcp /sse /tools — unchanged)
  → mcp-cogentia.service  :8791     (scripts/cogentia-mcp-http.js, registry-aware)
  → cogentia.service      :8790     (scripts/cogentia.js daemon, loopback)

Workstation / agent hosts
  → cogentia-mcp stdio     (same catalog as HTTP)
  → inseme-mcp stdio/HTTP  (Cogentia catalog + Ritornu + inseme_cockpit)
```

No new Caddy paths: `resources/*`, `skills/*`, `prompts/*`, and `server/discover`
are JSON-RPC methods on the existing `POST /mcp` endpoint.

## Desired catalog invariants (public Fracta)

| Check | Desired |
| --- | --- |
| Protocol | Dual-era: legacy `initialize` + modern `2026-07-28` `server/discover` |
| `server/discover` capabilities | `tools`, `resources`, `prompts`, `completions`, `extensions["io.modelcontextprotocol/skills"]` |
| Anonymous `tools/list` | Read tools only; **no** `cogentia_continuation_emit`, `_resolve`, `_issues_sync`, `_concepts_init` |
| Maximum set | Visible via `resources/list`, `skills/list`, `cogentia_cli_catalog`, `cogentia_pattern_list` even when omitted from `tools/list` |
| Skills | SEP-2640 `skills/list` + `skill://cogentia/<slug>/…` resources; tools-first `cogentia_skill_*` remain |
| Patterns | `cogentia_pattern_*` + `cogentia://pattern/…` — not Skills, not mandate |
| Packet results | `cogentia.mcp_tool_result/v1` |
| Inseme hub | Imports Cogentia core catalog; no parallel `COGENTIA_TOOLS` table |
| Mutate | Off on anonymous public; JHN/admin lockers unchanged |

Approximate public `tools/list` size after 0.9.0: **~50** (not a freeze; catalog is live).

## Operium invoke (ops, not anonymous MCP)

`operium up`, `operium invoke`, and `POST /ops/route/action` stay on the **ops**
plane (`/ops/*` behind the aggregator). They are **discoverable** as catalog
rows (`cogentia://cli/catalog` / this note) and are **not** added to anonymous
public `tools/list`. Desired: agents learn they exist from Operium docs and
`operium up`; they do not gain Fracta public mutate by that discovery.

## Deploy evidence

1. `operium up` — mcp-cogentia and cogentia daemon healthy.
2. On fracta: `git pull --ff-only` in `/srv/cogentia/repos/cogentia`, restart
   `cogentia.service` and `mcp-cogentia.service`.
3. If `/srv/cogentia/repos/inseme` is present, `git pull --ff-only` so the hub
   catalog stays aligned (Inseme MCP is not a Fracta systemd unit).
4. Smoke against `https://cogentia.fractavolta.com/mcp`:
   `initialize` → `tools/list` (mutate absent) → `server/discover` →
   `skills/list` → `resources/list`.

## Workstation daemon (Grok local MCP)

Fracta already has systemd `Restart=` on `cogentia.service`. The workstation
stdio client (`C:\tweesic\.grok\config.toml` → `:8790`) does not. Observed
failure mode (2026-08-22 Reality test): MCP reported `daemon_unavailable` for
**timeouts** while the Node process was still alive — `buildInventory` on
grep/docs routes blocked the event loop. Fix lives in Cogentia (`getDaemonInventory`
cache + `daemon_timeout` vs `daemon_unavailable` + JSONL traces). Start/watch:

```powershell
pwsh -File C:\tweesic\cogentia\scripts\ops\start-cogentia-daemon-windows.ps1
node C:\tweesic\cogentia\scripts\ops\watch-cogentia-daemon-windows.js
```

Canonical client wiring: [cogentia-mcp-clients.md](cogentia-mcp-clients.md).
Canonical adapter contract: Cogentia `docs/cogentia-mcp.md`.
