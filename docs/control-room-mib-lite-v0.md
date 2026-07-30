---
title: "Control room MIB-lite v0 — contract (P0)"
description: "First management contract for Fractanet control-room UI: agents, pull model, global list, node zoom. No central warehouse required."
document_role: design
document_kind: contract
visibility: public
lifecycle_state: active
updated: "2026-07-30"
---

# Control room MIB-lite v0 — contract (P0)

**Status:** written contract — implementation not started.  
**Product nickname:** control room **“La Nasa”**.  
**Step 1 (done):** local web home on `rpi3-view` — [rpi3-view-edge-portal.md](rpi3-view-edge-portal.md).  
**This document:** **step 2 contract** — SNMP-like agents + web UI to browse a management surface (MIB metaphor), global view + node zoom.

## 1. Intent

Each Fractanet node runs a **management agent** (Operium Node Agent / ONA).  
A **control-room web UI** offers:

1. a **global** list of known nodes and a coarse health summary;
2. a **zoom** on one node — browse identity, attributes, and current observations
   (the “MIB browser” feeling), without requiring a central time-series warehouse
   in v0.

SOMA supplies the **semantic** vocabulary; ONA supplies the **live** agent plane;
the UI is a **projection**, not a second source of truth.

## 2. Non-goals (v0)

- Full SNMP/OID trees or a legacy MIB compiler.
- Write / reconfigure actions from the UI (SOMA actions deferred).
- Long-term multi-year history or metrics TSDB.
- Replacing the edge portal’s degraded offline page.
- Making the Pi a coding or aggregation authority.

## 3. Roles and planes

| Role | Component | Port / place |
|------|-----------|--------------|
| Management agent | ONA (`operium-node-agent`) | `:8794` on each node |
| Semantics | SOMA | `/.well-known/soma`, `/soma/vocabulary`, `/soma/object`, `/soma/observations` |
| Coarse inventory | Registry | `registre-mariani/operium/registry/resources.yaml` (+ JHR registry) |
| Control-room UI (future host) | Web app (console and/or La Nasa panels) | fracta `/ops/console/` and/or Pi portal evolution |
| Edge home (step 1) | BusyBox portal | `rpi3-view` `:80` — **reachability only today** |

Metaphor mapping:

| SNMP world | Fractanet v0 |
|------------|--------------|
| Agent | ONA |
| MIB / SMI vocabulary | SOMA vocabulary + JSON schemas |
| GET object / walk | `GET /node/status`, `GET /soma/object`, `GET /soma/observations` |
| Manager station | Control-room UI |
| Trap / polling | Heartbeats, blackboard, edge store-forward (existing) |

## 4. Where data lives (v0 storage stance)

| Kind of data | Store | Notes |
|--------------|--------|--------|
| Live node body | **On the node** (ONA process + local SQLite/local-state) | Source of truth for “now” |
| Node identity & planned endpoints | **Registry** (git) | Which nodes exist; secret *refs*, not values |
| Last-known coarse fleet snapshot | **Optional file** on UI host (e.g. `status.json` style) | Degraded mode only |
| Historical series | **Out of v0** | Later: Fracta store / SQLite aggregator |

**Rule:** the UI **pulls** live data (or via a thin proxy on Fracta). It does not
require a new global database to start.

## 5. Node inventory (v0 fleet)

| `resource_id` | SSH / name | ONA expected |
|---------------|------------|--------------|
| `resource://fracta` | `fracta` | yes |
| `resource://i7-thinkpad-jhr` | `i7-thinkpad-jhr` | yes |
| `resource://rpi3-view` | `rpi3-view` | yes |
| `resource://poco-jhr` | `poco-jhr` | yes |

Unknown future nodes must still fit the same agent contract when enrolled.

## 6. Read contract (wire surfaces)

### 6.1 Discovery (safe / public when policy allows)

| Method | Path | Auth v0 |
|--------|------|---------|
| GET | `/.well-known/soma` | public if `ONA_HEALTH_PUBLIC=1` |
| GET | `/soma/vocabulary` | public if `ONA_HEALTH_PUBLIC=1` |

Returns SOMA descriptor (`soma.descriptor.v0`) and vocabulary. Used to paint
“what kind of node” without secrets.

### 6.2 Live body (read token)

| Method | Path | Auth v0 | Schema / role |
|--------|------|---------|----------------|
| GET | `/node/status` | `ONA_READ_TOKEN` / read bearer | `operium.node.status.v1` |
| GET | `/soma/object` | read bearer | Managed object graph for the node |
| GET | `/soma/observations` | read bearer | Current sampleable observations |
| GET | `/node/drift` | read bearer | Optional; if present, show in zoom |

**UI rule:** never embed long-lived tokens in static portal files on the Pi.
Prefer:

- Fracta-side proxy with server-held tokens (`/ops/node/:id/…` pattern already
  sketched in ONA docs), or
- short-lived session on the console host.

### 6.3 Coarse fleet snapshot (no token)

Existing edge portal probe file (not a MIB):

| Method | Path | Role |
|--------|------|------|
| GET | `/status.json` on `rpi3-view` | Reachability only (`operium.edge-portal.status.v1`) |

v0 global view **may** keep using this as a *fast* online/offline layer, then
enrich from ONA when tokens/proxy allow.

## 7. UI information architecture

### 7.1 Global view (“fleet”)

Minimum fields per row:

| Field | Source preference |
|-------|-------------------|
| `resource_id` / hostname | registry |
| online / offline / unknown | probe or ONA discovery timeout |
| `class` / profile | `/.well-known/soma` if reachable |
| last_seen | local UI cache or probe timestamp |
| health_score (if any) | `/node/status` when available |

Actions: open **zoom** for that node.

### 7.2 Zoom view (“MIB browser v0”)

Tabs or sections (read-only):

1. **Identity** — id, labels, class, profile, generated_at  
2. **Status** — `operium.node.status.v1` summary  
3. **Object** — `/soma/object` (tree or flat attribute list)  
4. **Observations** — `/soma/observations` (current samples only)  
5. **Raw** — link or collapsible JSON (debug)

No write buttons in v0.

### 7.3 Hosts for the UI

| Host | Role in roadmap |
|------|-----------------|
| Fracta Operium Console (`/ops/console/`) | Preferred management station (tokens stay on server) |
| `rpi3-view` portal | Step 1 home; later may *link* or embed a thin zoom panel via proxy, not store tokens |

## 8. Auth and trust (v0)

- **Public:** discovery + vocabulary only (when policy says so).  
- **Read body:** bearer read token; 401 without it (already observed fleet-wide).  
- **Pi desk display:** must remain usable **without** putting ONA admin tokens
  in `/srv/operium-edge-portal`.  
- Prefer Fracta as the place that holds read tokens for multi-node proxy.

## 9. Failure and degraded behaviour

| Situation | UI behaviour |
|-----------|--------------|
| Node unreachable | show offline; keep last_seen if cached |
| Discovery 200, object 401 | show “auth required for detail” |
| Partial timeout | do not block whole fleet list |
| WAN down on Pi | keep edge `status.json` home (step 1) |

## 10. Implementation phases (after this P0)

| Phase | Deliverable | Depends on |
|-------|-------------|------------|
| **P0** | This contract (done when merged) | — |
| **P1** | Homogeneous ONA/SOMA read on all four nodes; document tokens | ops |
| **P2** | Global fleet view in Console (or shared component) | P1 + proxy |
| **P3** | Node zoom / MIB-lite browser | P2 |
| **P4** | Optional last-known cache file for zoom | P3 |
| **P5** | Actions, history, richer graph | later |

Rough effort once P0 is accepted: **~2–3 weeks** for P1–P3 for one familiar
developer (see prior estimate); P1 ops often dominates.

## 11. Acceptance criteria for “P0 complete”

- [x] Contract published in Operium `docs/` and linked from docs index  
- [x] Explicit storage stance (no central DB required for v0)  
- [x] Explicit auth boundary (public discovery vs read body)  
- [x] Explicit global vs zoom views  
- [x] Clear separation from step-1 edge portal  
- [ ] Operator review (Jean Hugues) — accept or amend before P1 coding  

## 12. Related

- [rpi3-view edge portal](rpi3-view-edge-portal.md) — La Nasa step 1  
- [Fractanet control center](fractanet-control-center.md) — product ambition  
- [Operium Node Agent](operium-node-agent.md)  
- [ONA fleet install / SOMA endpoints](operium-node-agent-install.md)  
- [SOMA architecture](soma-semantic-object-management-architecture.md)  
- Schemas: `schemas/operium.node.status.v1.json`, snapshot/diagnose siblings  
- Registry: `registre-mariani` → `operium/registry/resources.yaml`
