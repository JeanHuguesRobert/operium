---
title: "Control room MIB-lite v0 — contract (P0)"
description: "First management contract for Fractanet control-room UI: agents, pull model, global list, node zoom. No central warehouse required."
document_role: design
document_kind: contract
visibility: public
lifecycle_state: active
updated: "2026-07-30"
decision_note: "v0 auth deferred — Tailscale trust perimeter only (operator 2026-07-30)"
---

# Control room MIB-lite v0 — contract (P0)

**Status:** written contract — implementation not started.  
**Product nickname:** control room **“La Nasa”**.  
**Step 1 (done):** local web home on `rpi3-view` — [rpi3-view-edge-portal.md](rpi3-view-edge-portal.md).  
**This document:** **step 2 contract** — SNMP-like agents + web UI to browse a management surface (MIB metaphor), global view + node zoom.

### Operator decision (2026-07-30) — auth deferred

For v0, **do not spend complexity budget on ONA read tokens / UI auth**.  
Trust boundary = **Fractanet Tailscale mesh only** (management ports not exposed on the public Internet).  
Spend the complexity budget on **homogeneous agents, global list, and node zoom**.  
Bearer auth and public-WAN hardening remain a **later** upgrade if the perimeter changes.

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
- **Authentication / bearer tokens for read** (deferred; Tailscale perimeter only).
- Exposing ONA management ports on the public Internet.

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

**Auth v0:** none for read paths used by the control room, **provided** ONA
listens only on Tailscale / loopback (not WAN). Implementation should prefer
binding or firewalling so `:8794` is not world-reachable.

### 6.1 Discovery

| Method | Path | Auth v0 | Role |
|--------|------|---------|------|
| GET | `/.well-known/soma` | none (mesh) | SOMA descriptor (`soma.descriptor.v0`) |
| GET | `/soma/vocabulary` | none (mesh) | Classes / attribute semantics |

### 6.2 Live body (“MIB” content)

| Method | Path | Auth v0 | Schema / role |
|--------|------|---------|----------------|
| GET | `/node/status` | none (mesh) | `operium.node.status.v1` |
| GET | `/soma/object` | none (mesh) | Managed object graph for the node |
| GET | `/soma/observations` | none (mesh) | Current sampleable observations |
| GET | `/node/drift` | none (mesh) | Optional; if present, show in zoom |

**P1 implementation:** set `ONA_MESH_OPEN_READ=1` on each agent (see
`docs/ona-mesh-open-read.md`). Admin/COP POST routes stay token-protected.

**UI rule:** call ONA over **MagicDNS / Tailscale IPs** only. No secrets in
static Pi portal files. No token plumbing in v0 UI code.

### 6.3 Coarse fleet snapshot

Existing edge portal probe file (not a MIB):

| Method | Path | Role |
|--------|------|------|
| GET | `/status.json` on `rpi3-view` | Reachability only (`operium.edge-portal.status.v1`) |

v0 global view **may** keep using this as a *fast* online/offline layer, then
enrich from ONA over the mesh.

## 7. UI information architecture

### 7.1 Global view (“fleet”)

Minimum fields per row:

| Field | Source preference |
|-------|-------------------|
| `resource_id` / hostname | registry |
| online / offline / unknown | probe or ONA discovery timeout |
| `class` / profile | `/.well-known/soma` if reachable |
| last_seen | local UI cache or probe timestamp |
| health_score (if any) | `/node/status` when reachable |

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
| Fracta Operium Console (`/ops/console/`) | Preferred multi-node station (same mesh, no token vault required in v0) |
| `rpi3-view` portal | Step 1 home; may later embed or link fleet/zoom panels over Tailscale |

## 8. Trust perimeter (v0) — not application auth

| Layer | v0 policy |
|-------|-----------|
| Network | **Tailscale Fractanet only** for ONA `:8794` and control-room clients |
| Application auth | **None** for read (MIB-lite) |
| Public Internet | ONA must **not** be advertised on WAN; Caddy public SOMA routes stay a separate, explicit choice |
| Later upgrade | Reintroduce bearer read tokens if any management plane leaves the mesh |

Complexity budget goes to **fleet coverage, UI global/zoom, and clear schemas** —
not to token plumbing.

## 9. Failure and degraded behaviour

| Situation | UI behaviour |
|-----------|--------------|
| Node unreachable | show offline; keep last_seen if cached |
| Discovery OK, object fails (timeout / still 401 until P1) | show error on zoom; do not block fleet list |
| Partial timeout | do not block whole fleet list |
| WAN down on Pi | keep edge `status.json` home (step 1) |

## 10. Implementation phases (after this P0)

| Phase | Deliverable | Depends on |
|-------|-------------|------------|
| **P0** | This contract (done when merged) | — |
| **P1** | Homogeneous ONA/SOMA **mesh-open read** on all four nodes | **done 2026-07-30** — [ona-mesh-open-read.md](ona-mesh-open-read.md) |
| **P2** | Global fleet view on La Nasa (`/cgi-bin/fleet` + portal UI) | **done 2026-07-30** |
| **P3** | Richer node zoom / MIB-lite (full object tree, vocabulary) | P2 |
| **P4** | Optional last-known cache file for zoom | P3 |
| **P5** | Actions, history, richer graph; **optional re-auth** if perimeter expands | later |

Rough effort once P0 is accepted: **~2–3 weeks** for P1–P3 for one familiar
developer; P1 is mostly **agent config / bind / verify**, not auth UI.

## 11. Acceptance criteria for “P0 complete”

- [x] Contract published in Operium `docs/` and linked from docs index  
- [x] Explicit storage stance (no central DB required for v0)  
- [x] Explicit trust perimeter: **Tailscale only, no app auth in v0**  
- [x] Explicit global vs zoom views  
- [x] Clear separation from step-1 edge portal  
- [x] Operator amendment 2026-07-30: defer authentication  
- [x] P1 mesh-open read on fracta, rpi3-view, poco-jhr, i7-thinkpad-jhr (2026-07-30)

## 12. Related

- [rpi3-view edge portal](rpi3-view-edge-portal.md) — La Nasa step 1  
- [Fractanet control center](fractanet-control-center.md) — product ambition  
- [Operium Node Agent](operium-node-agent.md)  
- [ONA fleet install / SOMA endpoints](operium-node-agent-install.md)  
- [SOMA architecture](soma-semantic-object-management-architecture.md)  
- Schemas: `schemas/operium.node.status.v1.json`, snapshot/diagnose siblings  
- Registry: `registre-mariani` → `operium/registry/resources.yaml`
