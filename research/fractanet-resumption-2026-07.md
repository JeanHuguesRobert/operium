---
title: "Fractanet resumption handoff — July 2026 pause"
description: "Cross-project memory for resuming Fractanet retrieval, Packet Attractor, and intermittent capable-node work."
layout: default
date: 2026-07-03
last_modified_at: 2026-07-04
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/research/fractanet-resumption-2026-07.md
document_role: "operational"
document_kind: "handoff"
visibility: "public"
lifecycle_state: "active"
status: "resumed — mesh live; Phase 2 routing pending"
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
| **Catalogue** (slow) | node profiles, verb registry refs, secret refs, fallback policy | Operium private registry (YAML, not in git) |
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
| Tailscale tailnet `virteal` | `fracta` + `i7-thinkpad-jhr` + `rpi3-view` connected |
| SSH mesh (bidirectional) | `ssh fracta` / `ssh thinkpad` / `ssh rpi3-view` over Tailscale verified |
| `fractanet-mesh` ed25519 key | deployed on workstation + fracta + Pi; Windows inbound SSH via `install-fractanet-ssh-windows.ps1` |
| Phase 1 blackboard | deployed on fracta (`/ops/blackboard`); laptop heartbeat task |
| `inox-serve` on capable host | Windows task, port 8792; fracta `guide.env` points to laptop Tailscale IP |
| Pi bootstrap | `rpi3-view` enrolled; script remains reusable for future Linux nodes |

### Still open

| Area | Notes |
|------|-------|
| `rpi3-view` local services | tailnet + SSH enrolled; local corpus mirror and domotics services still to deploy |
| Operator Android phone (`poco-jhr`) | enrolled; Termux mesh parity — capable-mobile experiment (retrieval TBD) |
| Phase 2 Guide routing | blackboard-aware `session/turn` selection not wired |
| Fallback policy A/B/C | when laptop offline |
| `/guide/health` 500 on fracta | daemon timeout on 1 GB VPS (separate from mesh) |
| Tailscale bootstrap auth key | keep until Android enrolled, then revoke |
| Device Identity Collection | tailnet ON; 2/2 opted-in; attrs visible in admin (2026-07-04) |

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

## Resume order (updated 2026-07-04)

1. ~~Execute [inseme#13](https://github.com/JeanHuguesRobert/inseme/issues/13) Phase 1~~ — **done** (blackboard + heartbeat).
2. ~~Deploy `inox-serve` on capable host; Tailscale mesh~~ — **done** — see [fractanet-mesh.md](../docs/fractanet-mesh.md).
3. Enroll operator Android phone; then revoke the bootstrap reusable auth key.
4. Deploy local corpus mirror and domotics services on `rpi3-view`.
5. Wire Guide to read attractor snapshot before `session/turn` ([cogentia#42](https://github.com/JeanHuguesRobert/cogentia/issues/42)) — **Phase 2**.
6. Triage fallback policy when laptop offline (A/B/C).
7. Remove Supabase/OpenAI from fracta `guide.env` once Phase 2 + policy are stable.

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
