---
title: "Fractanet resumption handoff — July 2026 pause"
description: "Cross-project memory for resuming Fractanet retrieval, Packet Attractor, and intermittent capable-node work."
layout: default
date: 2026-07-03
last_modified_at: 2026-07-05
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/research/fractanet-resumption-2026-07.md
document_role: "operational"
document_kind: "handoff"
visibility: "public"
lifecycle_state: "active"
status: "resumed — 4-node embryon live; Phase 2 routing pending"
---

# Fractanet resumption handoff — July 2026 pause

This note prepares **resumption** after a long session on Fractanet routing, intermittent
capable hosts, and the **Packet Attractor** concept. It is the cross-repo entry point for a
human or coding agent.

**Operational issue (actionable):**
[inseme#13 — Fractanet Packet Attractor proto handoff](https://github.com/JeanHuguesRobert/inseme/issues/13)

**Related implementation issue:**
[cogentia#42 — Retrieval Phase 4 Inox mandat](https://github.com/JeanHuguesRobert/cogentia/issues/42)

---

## North star (do not lose sight)

**Fractanet** is the ambitious goal — not a fracta ops tweak.

```text
No single point of failure. No single point of capture.
```

Routing is by **capability** and **legitimacy**, not fixed URLs. The distributed blackboard is
**attractor matching + COP traces**, not a centralized K/V store (Redis optional bootstrap only).

---

## What this session established

### 1. Intermittent capable host

The owner's laptop is a **Fractanet node**, not just a dev machine:

- rich capabilities (`inox-serve`, embeddings, Supabase);
- **not always powered on**;
- must **advertise** availability, not be reached via a static URL alone.

### 2. Resource registry vs blackboard (two layers)

| Layer | Role | Where |
|-------|------|-------|
| **Catalogue** (slow) | node profiles, verb registry refs, secret refs, fallback policy | `registre-mariani/operium/registry/resources.yaml` (private git; secret *values* stay in `~/.cogentia/secrets/`) |
| **Blackboard** (fast) | who attracts what **now** | Packet attractors + COP events (`advertised`, `matched`, `degraded`) |

Operium documents **facts and policy**. It is not the live routing table.

### 3. Packet Attractor crystallized (COP)

Canonical source document (pushed 2026-07-03):

- [inseme/research/packet_attractor_fractanet.md](https://github.com/JeanHuguesRobert/inseme/blob/main/research/packet_attractor_fractanet.md)

Key compression:

```text
pub/sub        = receive what is published on a channel
reactive query = receive what matches a structured demand
packet attractor = attract packets one is capable and legitimate to handle
```

Naming collision resolved in FractaVolta `concepts.md`: evolutionary attractor paper ≠ Fractanet
routing primitive.

### 4. Bootstrap vs target

| Stage | Routing | Status |
|-------|---------|--------|
| L1 bootstrap | `COGENTIA_INOX_RETRIEVAL_URL` in `guide.env` | **prod on fracta** (Tailscale → capable host, 2026-07-04) |
| L3 target | mandate carries `required_capabilities`; router matches attractors | **specified**, not implemented |
| RAIX target | mirrored attractor advertisements | **future** |

---

## What was already built before this session (context)

| Area | State | Ref |
|------|-------|-----|
| fracta Phase 0–1 retrieval | prod: Supabase backend, ~17–19 s E2E Guide | `cogentia/deploy/fracta/` |
| inox-serve | `POST /session/turn`, continuations, sidecar pool | `Inox/bin/inox-serve.js` |
| cogentia Inox client | `retrieval-inox-session.js`, `test:retrieval-inox` | `cogentia/scripts/lib/` |
| operium trust perimeter | fracta `guide.env`, Phase 4 intent | `operium/docs/fracta-trust-perimeter.md` |

**Was not done at pause (2026-07-03):** fracta prod pointer to capable host; dynamic fallback when host offline; attractor advertisement proto.

---

## Progress since resume (2026-07-04)

Operational detail: [Fractanet mesh — Tailscale and SSH](../docs/fractanet-mesh.md).

### Done

| Area | State |
|------|-------|
| Tailscale tailnet `virteal` (display **Fractanet**) | four nodes: `fracta`, `i7-thinkpad-jhr`, `rpi3-view`, `poco-jhr` |
| SSH mesh (bidirectional) | all four nodes; `poco-jhr` on Termux :8022 |
| `fractanet-mesh` ed25519 key | deployed on workstation + fracta + Pi + Termux; Windows inbound SSH via `install-fractanet-ssh-windows.ps1` |
| Phase 1 blackboard | deployed on fracta (`/ops/blackboard`); laptop heartbeat task |
| `inox-serve` on capable host | Windows task, port 8792; fracta `guide.env` points to laptop Tailscale IP |
| Pi bootstrap | `rpi3-view` enrolled; script remains reusable for future Linux nodes |
| Android (`poco-jhr`) | Termux mesh parity, layout, outbound SSH; corpus mirror ~3.1 G; Grok/Codex/Claude dev stack |
| Bootstrap auth key | `kMDGHHezga11CNTRL` **revoked 2026-07-05** after full enrollment |
| WAN topology documented | `poco-jhr` = mobile WAN hub; `fracta` = independent VPS WAN |

Per-node capability matrix: [fractanet-mesh.md § Embryon](../docs/fractanet-mesh.md#embryon-fractanet--node-capability-matrix).

### Still open

| Area | Notes |
|------|-------|
| `rpi3-view` local services | tailnet + SSH enrolled; `viewer.env`, corpus rsync, domotics, site-edge attractor still to deploy |
| `poco-jhr` Cogentia services | no `inox-serve` or blackboard heartbeat yet; Termux reliability (boot, wake-lock, battery) |
| ThinkPad disk | ~8 GB free — cleanup needed |
| Phase 2 Guide routing | blackboard-aware `session/turn` selection not wired |
| Fallback policy A/B/C | when laptop offline |
| `/guide/health` 500 on fracta | daemon timeout on 1 GB VPS (separate from mesh) |
| Device Identity Collection | tailnet ON; 2/2 opted-in on fracta + ThinkPad; attrs visible in admin (2026-07-04) |

---

## Open decision (must triage on resume)

When the capable host is **offline**, fracta Guide should:

| Option | Trade-off |
|--------|-----------|
| **A** — keep Supabase fallback on fracta | Guide always works; secrets stay on weak VPS |
| **B** — degraded only (no fallback) | fracta stays weak; visitors see explicit degradation |
| **C** — attractor routing + policy fallback | proper Fractanet; more implementation |

**Recommendation from session:** **C** long-term; **A** acceptable as transitional bootstrap.

---

## Resume order (updated 2026-07-05)

1. ~~Execute [inseme#13](https://github.com/JeanHuguesRobert/inseme/issues/13) Phase 1~~ — **done** (blackboard + heartbeat).
2. ~~Deploy `inox-serve` on capable host; Tailscale mesh~~ — **done** — see [fractanet-mesh.md](../docs/fractanet-mesh.md).
3. ~~Enroll operator Android phone; revoke bootstrap reusable auth key~~ — **done 2026-07-05** (`poco-jhr`).
4. ~~Android corpus mirror + coding agents~~ — **done 2026-07-05** — see [mobile dev section](../docs/fractanet-mesh.md#mobile-dev-environment-poco-jhr).
5. ThinkPad disk cleanup; Termux reliability on `poco-jhr`.
6. Deploy local corpus mirror and domotics services on `rpi3-view`.
7. Wire Guide to read attractor snapshot before `session/turn` ([cogentia#42](https://github.com/JeanHuguesRobert/cogentia/issues/42)) — **Phase 2**.
8. Triage fallback policy when laptop offline (A/B/C).
9. Remove Supabase/OpenAI from fracta `guide.env` once Phase 2 + policy are stable.

---

## First files for a coding agent

```text
inseme/research/packet_attractor_fractanet.md     ← canonical spec
operium/docs/fractanet-mesh.md                    ← tailnet + SSH mesh (observed state)
cogentia/scripts/cogentia-mcp-http.js             ← resolveGuideRetrievalBackend (static today)
cogentia/scripts/lib/packet-attractor-blackboard.js ← Phase 1 store
cogentia/scripts/lib/retrieval-inox-session.js      ← inox.session.v1 client
Inox/bin/inox-serve.js                            ← fulfiller HTTP
operium/docs/fracta-trust-perimeter.md            ← secrets / trust model
```

---

## Git commits from this arc (2026-07-03)

| Repo | Commit | Content |
|------|--------|---------|
| inseme | `d6a2e9e` | Packet Attractor source doc |
| Inox | `da24704` | Cross-links |
| FractaVolta | `cabaa4a` | concepts.md split |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-03 | Initial handoff at session pause |
| 2026-07-04 | Resumed: mesh doc, Phase 1 + inox Tailscale wiring done; resume order updated |
| 2026-07-05 | 4-node embryon complete: `poco-jhr` mesh + corpus + agents; auth key revoked; capability matrix in mesh doc |
