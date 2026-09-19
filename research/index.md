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
affiliation: Institut Mariani / C.O.R.S.I.C.A., 1 cours Paoli, F-20250 Corte, Corsica
language: en
status: working-paper
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

- [Hosted Browser and workstation recovery — 2026-09-10](handoff-hosted-browser-workstation-2026-09-10.md)
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
- [Navigation assistant local hold](../docs/navigation-assistant-local-hold.md) — ONA imports Cogentia's loopback gateway so the workstation extension stays connected while the TUI is down
- [Operium WIP Handoff](../docs/operium-wip.md)
- [Handoff — Fractanet embryon](handoff-fractanet-embryon-2026-07-05.md)
- [Generic Model Selector Design](model-selector-design.md)
- [Open Strategy for Model Selector](open-strategy-model-selector.md)
- [Workstation tooling debt and tool profiles](../docs/workstation-tooling-debt-and-profiles.md)

<!-- BEGIN_AUTO: index_catalog -->
## Corpus catalog

*Generated navigation. Editorial sections above remain human-maintained.*

| Document | Role | Updated |
|---|---|---|
| [Umbrella Cooperative Protocol between Cogentia and Operium (Mind & Body Architecture)](../.cogentia/issues/jeanhuguesrobert-operium/issue-00052.md) | source | unknown |
| [Add bounded Termux tmux handoff helper](../.cogentia/issues/jeanhuguesrobert-operium/issue-00019.md) | source | unknown |
| [ADR — Fix Bugs First via versioned Bug/Feature backlog](../decisions/fix-bugs-first-backlog.md) | source | 2026-08-11 |
| [Agent CLI Gateway — Windows lifetime (logon task)](../docs/agent-gateway-windows-lifetime.md) | operational | 2026-07-29 |
| [Agent John (WhatsApp) templates](../templates/agent-john/README.md) | template | 2026-08-22 |
| [Agent John WhatsApp — retrieval desired state (Fracta)](../docs/agent-john-whatsapp-retrieval.md) | operational | 2026-08-13 |
| [Apply Magistral coding-agent map on fracta (Guide synthesis)](../.cogentia/issues/jeanhuguesrobert-operium/issue-00010.md) | source | unknown |
| [Case 001 — dogfood the next real incident as a Cognitive Packet Odyssey](../.cogentia/issues/jeanhuguesrobert-operium/issue-00022.md) | source | unknown |
| [Claude Code mode (pro ↔ z.ai)](../docs/claude-code-mode.md) | source | 2026-08-02 |
| [Coding Infrastructure - Operational Documentation](../docs/coding-infrastructure.md) | source | 2026-09-04 |
| [Cogentia MCP for coding agents](../docs/cogentia-mcp-clients.md) | source | 2026-08-22 |
| [Concevoir un handoff robuste entre PC, Termux et Fracta au-delà des branches WIP](../.cogentia/issues/jeanhuguesrobert-operium/issue-00018.md) | source | unknown |
| [Control room MIB-lite v0 — contract (P0)](../docs/control-room-mib-lite-v0.md) | operational | 2026-08-19 |
| [COP Event log and continuation wakes for FractaCalendar](../.cogentia/issues/jeanhuguesrobert-operium/issue-00031.md) | source | unknown |
| [Corpus replication topology](../docs/corpus-replication-topology.md) | source | 2026-09-04 |
| [DNS Provider Portability and Reversible Migration](../docs/dns-provider-portability.md) | operational | 2026-08-31 |
| [DNS/Email Cloudflare : réconciliation opérationnelle par domaine](../.cogentia/issues/jeanhuguesrobert-operium/issue-00037.md) | source | unknown |
| [Doctrine opérationnelle — stockage adressé par contenu, buckets et Plakar](../.cogentia/issues/jeanhuguesrobert-operium/issue-00002.md) | source | unknown |
| [Documentation](../docs/README.md) | source | 2026-09-04 |
| [Email capability boundary: bounded forwarding ping and future inbound processing](../.cogentia/issues/jeanhuguesrobert-operium/issue-00028.md) | source | unknown |
| [Examples](../examples/README.md) | example | 2026-06-24 |
| [Federated Capacity Registry — implementation checklist](federated-capacity-registry-implementation-checklist.md) | operational | 2026-08-16 |
| [Fix Bugs First — Bug/Feature tracking (Operium)](../docs/fix-bugs-first.md) | operational | 2026-07-26 |
| [fracta Caddy vhost contract](../docs/fractavolta-caddy-contract.md) | operational | 2026-08-31 |
| [Fracta coding workspace bootstrap](../docs/fracta-coding-workspace.md) | operational | 2026-07-28 |
| [FractaCalendar : projection fédérée des obligations temporelles](../.cogentia/issues/jeanhuguesrobert-operium/issue-00029.md) | source | unknown |
| [Governed COGENTIA_REASONING_LOOP_V2 rollout after public Guide baseline](../.cogentia/issues/jeanhuguesrobert-operium/issue-00045.md) | source | unknown |
| [Hosted Browser: clarify and implement real multi-user provisioning and KasmVNC authentication](../.cogentia/issues/jeanhuguesrobert-operium/issue-00025.md) | source | unknown |
| [Hosted Browser: prototype a truly lightweight native VNC/RFB human projection alongside KasmVNC](../.cogentia/issues/jeanhuguesrobert-operium/issue-00024.md) | source | unknown |
| [Hosted Workspace session modes gated by auth assurance](../.cogentia/issues/jeanhuguesrobert-operium/issue-00049.md) | source | unknown |
| [Implement FractaNet observed-state reconciliation](../.cogentia/issues/jeanhuguesrobert-operium/issue-00009.md) | source | unknown |
| [Implement Operium WIP handoff/resume for cross-device Fractanet work](../.cogentia/issues/jeanhuguesrobert-operium/issue-00007.md) | source | unknown |
| [Job runner éphémère — gros traitements CPU/RAM à la demande](../.cogentia/issues/jeanhuguesrobert-operium/issue-00003.md) | source | unknown |
| [La Nasa — Networked Agency Situational Awareness](../docs/la-nasa.md) | source | 2026-08-28 |
| [MCP capability surface — desired state](../docs/mcp-capability-surface.md) | operational | 2026-08-31 |
| [Olé Olé Fracta preview](../templates/oleole/README.md) | template | 2026-08-24 |
| [Olé Olé public DNS health](../docs/oleole-acorsica-dns-health.md) | operational | 2026-08-13 |
| [ONA mesh-open read (P1)](../docs/ona-mesh-open-read.md) | operational | 2026-08-31 |
| [OP-BUG-001: Agent CLI Gateway Tailscale reachability intermittent from fracta](../.cogentia/issues/jeanhuguesrobert-operium/issue-00011.md) | source | unknown |
| [OP-BUG-002: System bearer rotation leaves runtime copies out of sync](../.cogentia/issues/jeanhuguesrobert-operium/issue-00012.md) | source | unknown |
| [OP-BUG-003: Open Operium issues lack kind/subsystem labels](../.cogentia/issues/jeanhuguesrobert-operium/issue-00013.md) | source | unknown |
| [OP-BUG-004: Workstation admin-scoped npm tooling breaks user-space installs](../.cogentia/issues/jeanhuguesrobert-operium/issue-00014.md) | source | unknown |
| [OP-BUG-005: Secrets research notes drift from secrets-management.md](../.cogentia/issues/jeanhuguesrobert-operium/issue-00015.md) | source | unknown |
| [Operium](../README.md) | source | 2026-08-31 |
| [Operium backlog (Bug/Feature register)](../backlog/README.md) | operational | 2026-07-26 |
| [Operium Corpus graph service](../docs/corpus-graph-service.md) | source | 2026-09-15 |
| [Operium Environment Configuration via Views Store](../decisions/views-store-env-consumption.md) | source | 2026-07-23 |
| [Operium Federated Capacity Registry](federated-capacity-registry.md) | source | 2026-08-16 |
| [Pause 2026-09-03 — complete WIP vs origin/main (all corpus repos)](../.cogentia/issues/jeanhuguesrobert-operium/issue-00046.md) | source | unknown |
| [Pause 2026-09-04 — Multi-node workspace replication (fracta, fracta2, poco, rpi3) & AGENTS.md governance](../.cogentia/issues/jeanhuguesrobert-operium/issue-00051.md) | source | unknown |
| [Pertitellu Corte / LePP Fracta Preview](../templates/pertitellu/README.md) | template | 2026-09-01 |
| [poco-jhr: Termux:Boot install (Android 16) + MIUI autostart fallback](../.cogentia/issues/jeanhuguesrobert-operium/issue-00006.md) | source | unknown |
| [Portable automation: Node now, Inox progressively](../docs/portable-automation-node-inox.md) | source | 2026-07-28 |
| [Provision `fracta2` and build the minimal persistent Hosted Browser POC (KasmVNC + Chromium + CDP)](../.cogentia/issues/jeanhuguesrobert-operium/issue-00023.md) | source | unknown |
| [Public Guide OpenRouter free fallback](../docs/guide-openrouter-free-fallback.md) | operational | 2026-08-22 |
| [Remaining COP calendar depth after #31](../.cogentia/issues/jeanhuguesrobert-operium/issue-00040.md) | source | unknown |
| [Remote Web Session and Hosted Browser Status](../docs/remote-web-session-status.md) | operational | 2026-08-28 |
| [Remove Fracta secret-bearing rollback copy and audit systemd overrides](../.cogentia/issues/jeanhuguesrobert-operium/issue-00008.md) | source | unknown |
| [Restore public Cogentia Guide/aggregator reachability before V2 rollout](../.cogentia/issues/jeanhuguesrobert-operium/issue-00042.md) | source | unknown |
| [rpi3-view edge portal — control-room display (step 1)](../docs/rpi3-view-edge-portal.md) | operational | 2026-09-04 |
| [Schema](../schema/README.md) | source | 2026-06-24 |
| [Semantic Backup — hot/warm/cold storage, Syncthing and semantic distillation](../.cogentia/issues/jeanhuguesrobert-operium/issue-00021.md) | source | unknown |
| [Shell profiles (Fractanet nodes)](../docs/workstation-shell-profile.md) | operational | 2026-07-29 |
| [SNMP MIB semantics → SOMA managed objects](../docs/mib-snmp-semantics-for-soma.md) | operational | 2026-07-30 |
| [SOMA — Semantic Object Management Architecture](../docs/soma-semantic-object-management-architecture.md) | operational | 2026-07-28 |
| [Stalwart mail for Digital Twin JHN (fracta)](../docs/stalwart-private-mail.md) | operational | 2026-07-27 |
| [Stalwart templates (secret-free)](../templates/stalwart/README.md) | template | 2026-07-27 |
| [Templates](../templates/README.md) | template | 2026-08-13 |
| [Termux tmux handoff](../docs/termux-tmux-handoff.md) | operational | 2026-08-06 |
| [Track vendor-neutral API usage and billing monitoring](../.cogentia/issues/jeanhuguesrobert-operium/issue-00001.md) | source | unknown |
| [Trusted-node La Nasa projection: observer views, loopback resolution, and constrained displays](../.cogentia/issues/jeanhuguesrobert-operium/issue-00026.md) | source | unknown |
| [Validate secure Remote Access to the Pi shared graphical session](../.cogentia/issues/jeanhuguesrobert-operium/issue-00027.md) | source | unknown |
| [Views Store — Cogentia published views served via Caddy](../decisions/views-store-caddy-service.md) | source | 2026-07-26 |

<!-- END_AUTO: index_catalog -->
