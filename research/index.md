---
title: Research Index — Operium
description: A map of Operium's doctrine, operational notes and initial architectural decision.
layout: default
nav_order: 1
date: 2026-06-24T00:00:00.000Z
last_modified_at: 2026-06-24T00:00:00.000Z
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/research/index.md
document_role: index
document_kind: research-index
visibility: public
lifecycle_state: active
classification_source: cogentia.js
classification_version: '1'
classification_rule: research-index
classification_confidence: strong
author: unknown
provenance:
  origin_type: unknown
  origin_repository: unknown
  origin_ref: unknown
  origin_date: unknown
  derived_from: []
review:
  status: unreviewed
  reviewed_by: []
update_policy: UP-DEFAULT-REVIEWED
---
# Research Index — Operium

## Start here

- [Operium Doctrine](../doctrine.md)
- [AGENTS.md — Operium agent mandate](../AGENTS.md) — includes **ops ownership** (no dual runbooks under app repos)
- [Operational health](../docs/operational-health.md)
- [Public / private split](../docs/public-private-split.md)
- [Fracta trust perimeter and secrets](../docs/fracta-trust-perimeter.md)
- [Operium CLI](../docs/operium-cli.md) — `operium up`, invoke, node diagnose, calendar
- [FractaCalendar](../docs/fracta-calendar.md) — federated projection of temporal obligations (issue #29)
- [FractaCalendar ↔ COP wake protocol](../docs/calendar-cop-wake-protocol.md) — ticks are not packets; wakes deliver packets

### Live ops priorities (July 2026)

- [Magistral → coding-agent routing (Guide synthesis)](../docs/magistral-coding-agent-routing.md) — desired map + apply; **issue [#10](https://github.com/JeanHuguesRobert/operium/issues/10)**
- [ADR — Magistral coding-agent routing](../decisions/magistral-coding-agent-routing.md)
- Map template: [`profiles/magistral-map.coding-agents.v1.json`](../profiles/magistral-map.coding-agents.v1.json)
- [Fractanet mesh — Tailscale and SSH](../docs/fractanet-mesh.md)
- [fractavolta.com DNS zone](../docs/fractavolta-dns.md)

### Doctrine & method

- [Cogentia Semantic Stack](../docs/cogentia-semantic-stack.md)
- [Cogentia Agent Indexing Roadmap](../docs/cogentia-agent-indexing-roadmap.md)
- [Operia](../docs/operia.md)
- [ADR-0001 — Operium scope](../decisions/ADR-0001-operium-scope.md)

### Incidents & handoffs

- [Fractanet resumption handoff — July 2026 pause](fractanet-resumption-2026-07.md)
- [FractaCalendar COP remaining depth — 2026-08-31 pause](handoff-calendar-cop-2026-08-31.md)
- [fracta daemon health latency — July 2026 incident](fracta-daemon-health-2026-07.md)
- [inox-serve offline on ThinkPad — July 2026 incident](inox-serve-thinkpad-2026-07.md)
- [Serra corpus integration plan](serra-corpus-integration-plan.md)

### Secrets (authority vs historical research)

- **Operational authority:** [Secrets management](../docs/secrets-management.md) — dual authority, `COGENTIA_API_KEY`, `apply-system-bearer.js`
- **Historical only (do not implement from these):**
  - [Secrets architecture notes — 2026-07](secrets-architecture-2026-07.md) (superseded; OP-BUG-005)
  - [Secrets sovereign architecture — 2026-07](secrets-sovereign-architecture.md) (superseded; OP-BUG-005)

---

*Corpus index for the Operium registry.*

- [Hosted Browser POC Architecture](../docs/hosted-browser-kasmvnc-cdp.md)
- [FractaNode 2 (fracta2) Bootstrap Runbook](../docs/fracta2-node-bootstrap.md)
- [FractaNet Control Center](../docs/fractanet-control-center.md)
- [Operium Console](../docs/operium-console.md)
- [Operium Node Agent — fleet install](../docs/operium-node-agent-install.md)
- [Operium Node Agent](../docs/operium-node-agent.md)
- [Operium WIP Handoff](../docs/operium-wip.md)
- [Handoff — Fractanet embryon](handoff-fractanet-embryon-2026-07-05.md)
- [Generic Model Selector Design](model-selector-design.md)
- [Open Strategy for Model Selector](open-strategy-model-selector.md)
- [Workstation tooling debt and tool profiles](../docs/workstation-tooling-debt-and-profiles.md)

