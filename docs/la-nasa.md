---
title: La Nasa — Networked Agency Situational Awareness
description: Canonical meaning and architectural constraints of the FractaNet control-station concept.
document_role: source
document_kind: concept-definition
visibility: public
lifecycle_state: active
date: '2026-08-28'
language: en
related_projects:
  - FractaNet
  - Operium
  - Cogentia
  - COP
  - ONA
  - SOMA
classification_source: cogentia.js
classification_version: '1'
classification_rule: explicit-metadata
classification_confidence: medium
license: CC BY-SA 4.0
affiliation: Institut Mariani / C.O.R.S.I.C.A., 1 cours Paoli, F-20250 Corte, Corsica
update_policy: UP-DEFAULT-REVIEWED
status: working-paper
review:
  status: unreviewed
  reviewed_by: []
provenance:
  origin_type: unknown
  origin_repository: unknown
  origin_ref: unknown
  origin_date: unknown
  derived_from: []
---


# La Nasa — Networked Agency Situational Awareness

## Operational observation (2026-11-16)

This concept is **not a single physical process or central server**. After
retirement of the former `fracta` VPS, the ONA instance on `fracta2`
provides a live Tailnet-only observer at `http://fracta2:8794/`
(`GET /nasa/fleet`, `GET /nasa/node?host=fracta2`). It was
verified responding HTTP 200 with its own identity and the ThinkPad
observable. **This does not prove that the wall-mounted Pi display is
operating.** As of this observation, `rpi3-view` had been unavailable
on Tailscale for approximately nine days; its local power, LAN, screen
and session must be checked independently.

The public Cogentia Guide remained reachable on Fracta2, while the
**legacy Views Store** previously served by `fracta` at port 3423
was **not deployed on Fracta2** during the 2026-11-10 public-address
handoff. The old public `/api/views` endpoint returned HTTP 404.
These are three separate facts: observer availability, source
projection availability, and local kiosk availability.

La Nasa now probes its five known nodes concurrently with a bounded
observation deadline. A peer which did not answer in time is
`unconfirmed`, not automatically declared offline. Separately, a
time-stamped, sanitized Tailscale control-plane observation identifies
nodes reported offline by the mesh. **Tailscale presence is not proof
that ONA works; failed ONA is not proof that a machine is powered off.**
Retain sources, timestamps and uncertainty in future displays.

Do not re-expose old Views Store files on a public host without an
explicit destination and visibility review. Regenerated public views,
private operator views and a physical wall kiosk have different
access and publication boundaries.


## 2026-11-18 — Node-local compute and route-awareness frontier

The Principal's `https://jhn.baronsmariani.org/nasa` on Fracta2 now projects
four strictly local ONA reads: node health, legacy fleet probe, node-local
`/node/peers` registry and SOMA `/soma/object` compute measurements.
The last two are bounded and redacted in the authenticated JHN API; peer
endpoint URLs, service credentials and raw node payloads are not published.
The fixed five-host fleet view is supplementary evidence, **not** a routing
candidate directory.

ONA attractors only advertise `operium.node.v1` observability today.
The local peer cache survives a failed blackboard sync until TTL/retention
cleanup. Attractor freshness is recomputed on read from last_seen + TTL,
even if the stored `fresh` bit has not yet been updated by the sweeper;
after expiration, a record is not a fresh neighbor, whether retained or
deleted. An ONA status or a Tailscale online observation does not establish
a packet-specific compute capacity or a working multi-hop transport path.

As intended by the [Locality Principle](https://github.com/JeanHuguesRobert/cogentia/blob/main/research/locality_principle.md),
each node owns its local observations and can build situated views of other
nodes. It does not own their state or mandates. The intended
**Mesh Network Learning Computer** extends this to *computation*:
attractors advertise mobilizable capabilities; recorded packet hops,
outcomes and returns to Ithaca provide stigmergic evidence about paths.
A derived projection can influence future FractaRouting decisions without
becoming a second authority or a central trace registry.

The [Informational Gravity](https://github.com/JeanHuguesRobert/cogentia/blob/main/research/informational_gravity.md)
research addendum dated 2026-11-18 defines candidate path-trace fields and
two-/three-node Reality Tests. **Current status:** peer awareness and local
compute observation are implemented; packet-specific capacity benchmarks,
multi-hop routing, path-performance receipts, learned path attraction and
Ithaca assimilation are still unimplemented, and are not claimed by La Nasa.

The November 18 reality check also found and repaired a self-probe
startup race: ONA formerly probed its own /health endpoint before opening
the HTTP listener, producing a spurious failed health check after a normal
restart. The bootstrap now starts listening before its first self-probe.
A healthy HTTP listener is not a substitute for the rest of the health matrix.

## Canonical expansion

In the FractaNet / Operium vocabulary, **NASA** is the deliberate backronym:

```text
Networked
Agency
Situational
Awareness
```

A **La Nasa** is a control-station surface that provides this situational awareness from a particular observer or operational viewpoint.

The name deliberately reuses the familiar cultural image of a NASA mission-control room. That is the wink. The architecture is different: La Nasa is neither an omniscient headquarters nor a central brain.

## Agency

**Agency** is used in the strong operational sense: capacity to act in context while preserving the distinctions between:

```text
capability
mandate
legitimacy
principal
authorization
execution
evidence
```

Agency MUST NOT be interpreted as unrestricted machine autonomy. A capability does not create a mandate, and visibility of an action does not authorize it.

## Situational Awareness

**Situational Awareness** is an observer-relative, evidence-bearing understanding of relevant distributed state, including questions such as:

- what exists;
- what is reachable;
- what is fresh, stale, uncertain, or disconnected;
- which capabilities are available;
- which agents exist and where their instances run;
- what can act;
- what may act, for which principal and under which mandate;
- what is acting or has acted;
- what evidence supports those assertions;
- what requires human attention or authorization.

The central invariant is:

> **La Nasa is a controllable projection of distributed states and events, not the represented reality and not a central brain.**

## Observer-relative and plural

There is no requirement for a single La Nasa.

A useful model is:

```text
FractaNet set S as observed by observer O
```

Different FractaNodes, Casas, operators, or other legitimate observers MAY expose different La Nasa projections. During partitions or partial failure, those projections MAY legitimately differ in reachability, freshness, cached state, or unresolved conflicts.

Therefore:

```text
La Nasa(O1) ≠ La Nasa(O2)
```

without either view necessarily being wrong.

## Control Station

The preferred full expression is:

> **La Nasa — a Networked Agency Situational Awareness Control Station**

A particular installation may be named by place or observer, for example:

> **La Nasa — Paoli Control Station**

The concise local name remains **La Nasa**.

## Mnemonic, not canonical expansion

The following secondary mnemonic usefully recalls four important things visible in the control room:

```text
Nodes
Agents
States
Acts
```

It is intentionally memorable, but it is NOT the canonical expansion of NASA.

## Relationship to existing Operium documents

This definition clarifies rather than replaces the existing FractaNet Control Center doctrine.

In particular it preserves these established properties:

- La Nasa is a projection, not the canonical store;
- it must expose provenance, evidence, freshness, and uncertainty;
- it distinguishes capability from legitimacy and mandate;
- it supports local, remote, constrained, and machine-readable projections;
- it is compatible with observer-relative ONA/SOMA views;
- it must degrade gracefully during disconnection;
- network membership alone does not confer administrative authority.

Related documents:

- [FractaNet Control Center](fractanet-control-center.md)
- [rpi3-view edge portal](rpi3-view-edge-portal.md)
- [Control room MIB-lite v0](control-room-mib-lite-v0.md)
- [SOMA — Semantic Object Management Architecture](soma-semantic-object-management-architecture.md)
- [ONA mesh-open read](ona-mesh-open-read.md)

## Canonical one-sentence definition

> **La Nasa is a Networked Agency Situational Awareness Control Station: an observer-relative, evidence-bearing operational projection that helps humans and authorized agents understand distributed state and agency without pretending to be an omniscient central brain or an authority merely because it can observe the system.**
