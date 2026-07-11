---
title: "FractaNet Control Center — La Nasa, a Control Station for Mandated Agency"
short_title: "FractaNet Control Center"
version: "0.1"
status: "working-draft"
date: 2026-07-11
author: "Jean Hugues Noël Robert, baron Mariani"
affiliation: "Institut Mariani / C.O.R.S.I.C.A., 1 cours Paoli, F-20250 Corte, Corsica"
license: "Apache-2.0"
language: "en"
document_role: "operational"
document_kind: "implementation-specification"
visibility: "public"
lifecycle_state: "working"
human_validation_required: true
intended_repository: "JeanHuguesRobert/operium"
intended_path: "docs/fractanet-control-center.md"
canonical_untranslated_terms:
  - Casa
  - La Nasa
related_projects:
  - FractaNet
  - Operium
  - COP
  - Cogentia
  - Gabriel
  - Inox
  - FractaVolta
source_refs:
  - "operium/doctrine.md"
  - "operium/decisions/ADR-0001-operium-scope.md"
  - "operium/docs/fractanet-mesh.md"
  - "operium/research/fractanet-resumption-2026-07.md"
  - "inseme/packages/cop-core/Architecture.md"
  - "inseme/packages/cop-core/schemas/identity.mandate.schema.json"
  - "inseme/research/packet_attractor_fractanet.md"
  - "gabriel/README.md"
---

# FractaNet Control Center

## La Nasa, a Control Station for Mandated Agency

## 0. Document status

This document is a first implementation specification. It converts a set of doctrinal distinctions into a limited, observable, and testable vertical slice.

It is not yet:

- the general specification of a Casa;
- the complete specification of Gabriel;
- a final ontology of subjects, agents, collectives, and persons;
- a complete decentralized identity infrastructure;
- an automated legal-authority system;
- a production-ready controller for critical operations.

It defines a first concrete product: a permanent dashboard on `rpi3-view`, accessible through several visibility profiles, that makes FractaNodes, agents, mandates, missions, acts, evidence, alerts, Casas, and synchronization states observable.

Non-blocking ambiguities are retained in **Open questions**. The implementation MUST NOT resolve them silently.

---

# 1. Language and terminology policy

## 1.1. English as the specification language

The normative language of this document is English.

Names, identifiers, quotations, historical terms, and project-specific proper nouns may remain in their source language where translation would reduce precision.

## 1.2. Casa is intentionally not translated

**Casa** is a canonical FractaNet term and MUST remain `Casa` in English, French, Corsican, Italian, Spanish, and other language versions.

In this specification, Casa does not mean only a residential building.

> A **Casa** is a persistent, inhabitable, governed domain through which a subject or collective maintains continuity across physical and immaterial environments.

A Casa may organize or reference:

- identity;
- inhabitants and members;
- memory and corpus;
- mandates;
- agents;
- capabilities;
- resources;
- places;
- relationships;
- rights and responsibilities;
- acts and evidence;
- physical anchors;
- digital anchors;
- rules of access, hospitality, delegation, and governance.

A physical home may be one anchor of a Casa. It is not necessarily the entire Casa.

A repository may be one memory-bearing fragment of a Casa. It is not necessarily the entire Casa.

A phone may be one access terminal to a Casa. It is not the Casa and is not the identity of its inhabitant.

## 1.3. Historical and fictional anchors

The exact English term in Frank Herbert's *Dune* universe is **House Atreides**. The political order includes **Great Houses**. This illustrates the established extension of “house” from a building to a lineage, polity, and organized domain.

The FractaNet term `Casa` draws on that broad family of meanings, including expressions such as:

- a family house or lineage;
- a royal or dynastic house;
- an institutional house;
- a fictional Great House;
- a physical home;
- an immaterial domain.

This is a deliberate conceptual extension. It MUST NOT be presented as if Classical Latin `casa` alone historically carried every one of these meanings.

## 1.4. Etymological caution

In Classical Latin, `casa` primarily referred to a hut or modest dwelling. Roman concepts closer to household, extended household, lineage, and descent group include `domus`, `familia`, and `gens`.

The FractaNet concept therefore uses `Casa` as a modern canonical term inspired by, but not reducible to, any single ancient category.

This distinction is an AI-safety requirement: the system MUST distinguish historical evidence from later analogy and deliberate semantic design.

## 1.5. Inhabiting

The English verb *inhabit* derives through Latin `inhabitare`, from `in-` and `habitare`, a frequentative of `habere`, “to have” or “to hold.”

This provides a useful conceptual orientation:

> To inhabit is not merely to be geometrically located somewhere. It is to maintain a lived, repeated, and situated relation with a domain.

This etymological observation is an inspiration, not a normative proof.

## 1.6. Indigenous peoples, nations, tribes, and Casas

A people, Indigenous nation, tribal nation, confederation, clan, or community MAY choose to represent itself through a Casa.

The system MUST NOT infer that these terms are interchangeable.

In particular:

- `nation` is not automatically equivalent to `state`;
- `people` is not automatically equivalent to `population`;
- `tribe` may be a self-designation, a legal category, or an externally imposed label;
- residence does not automatically imply membership;
- ancestry does not automatically imply consent or political affiliation;
- a state database MUST NOT assign Casa membership solely from ethnicity, address, language, or behavioral inference.

A Casa representing a people or Indigenous nation MUST be grounded in self-identification, legitimate governance, declared membership rules, or explicit evidence appropriate to that people.

---

# 2. Purpose

The **FractaNet Control Center** provides an operational projection of the current FractaNet embryo.

Its local instance at 1 cours Paoli is called:

> **La Nasa — Paoli Control Station**

The system SHALL allow an inhabitant or authorized operator to answer the following questions quickly:

1. Which FractaNodes exist?
2. Which nodes are currently reachable, advertised, stale, or intentionally offline?
3. Which capabilities are installed, declared, tested, and presently available?
4. Which agents exist, through which implementations, in which instances, and on which machines?
5. For which principal, under which role and mandate, may an agent act?
6. Which missions are active?
7. Which acts have been proposed, performed, rejected, failed, or compensated?
8. Which acts are engaging?
9. Which human decisions or authorizations are required?
10. Which information is fresh, old, uncertain, or pending synchronization?
11. Which evidence supports each important dashboard assertion?
12. Which information may be shown locally, remotely, to an accredited peer, or publicly?
13. Which Casa, sub-Casa, peer Casa, place, or resource is affected?

The dashboard is not a central brain. It is a **controllable projection** of distributed states and events.

---

# 3. Core principles

## 3.1. Operational memory before automation

The system applies the Operium doctrine:

```text
make current state visible;
make intended evolution explicit;
make operational health verifiable.
```

Durable sources SHALL remain human-readable, versioned, and auditable.

Dashboards, probes, and assistants are projection and assistance layers. They do not replace the registries, events, and evidence from which they derive.

## 3.2. Conserved distinctions

The implementation MUST NOT silently merge the following notions:

```text
living person
≠ subject
≠ role
≠ inhabitant
≠ member
≠ guest
≠ owner
≠ steward
≠ principal
≠ representative
≠ Gabriel
≠ agent
≠ AI model
≠ agent implementation
≠ agent instance
≠ session
≠ tool
≠ process
≠ device
≠ FractaNode
≠ place
≠ Casa
≠ physical home
≠ industrial digital twin
≠ cognitive twin
≠ cogentigram
```

The system may link these entities. It MUST NOT identify them implicitly.

## 3.3. Representation is not the represented reality

```text
subject
≠ profile
≠ record
≠ model
≠ cogentigram
≠ cognitive twin
```

Every representation SHALL expose, when relevant:

- provenance;
- date or observation period;
- confidence;
- scope;
- contradictions;
- revision status;
- visibility;
- known omissions.

## 3.4. Capability and legitimacy

An installed capability is not an authorization.

An available capability is not a mandate.

A valid mandate does not imply that a machine is available.

An admissible execution requires at least:

```text
available capability
+ valid mandate
+ compatible context
+ permitted engagement level
+ sufficient traceability
```

## 3.5. Appropriate granularity

The dashboard SHALL display intelligible acts such as:

- inspecting a repository;
- producing a report;
- creating or modifying a file;
- executing tests;
- creating a commit;
- pushing a branch;
- opening a pull request;
- deploying a service;
- publishing a document;
- sending a message;
- changing a configuration;
- revoking a mandate.

It SHOULD NOT expose every system call, token, or elementary write by default.

Fine-grained traces remain accessible as expandable evidence.

## 3.6. Locality and subsidiarity

A decision or computation SHOULD remain at the most local level that is simultaneously:

- capable;
- legitimate;
- sufficiently informed;
- sufficiently safe.

The system SHALL:

- process locally what can be processed locally;
- share only what must be shared;
- escalate only what cannot be resolved locally;
- make every scale change explicit.

Locality is multidimensional:

- physical;
- network;
- informational;
- cognitive;
- social;
- institutional;
- legal;
- temporal;
- political.

## 3.7. Fractality

The same primitives SHALL be composable at several levels:

```text
identity
boundary
mandate
capability
mission
act
evidence
control
```

They may apply to:

- a tool;
- an agent;
- a Gabriel;
- a device;
- a FractaNode;
- a Casa;
- a collective;
- a subnetwork;
- FractaNet.

Structural recurrence MUST NOT erase ontological differences between entities.

## 3.8. Fractal Casas

A Casa may:

- contain sub-Casas;
- belong to or participate in a larger Casa;
- cooperate laterally with peer Casas;
- share a room, capability, corpus fragment, or service with another Casa;
- have multiple physical and immaterial anchors;
- preserve local sovereignty while participating in wider coordination.

The three fundamental movements are:

```text
downward: delegation and specialization;
upward: aggregation, evidence, and escalation;
lateral: cooperation among peers.
```

A Casa graph is not necessarily a strict tree. Overlap MUST be explicit and governed.

## 3.9. Proportionate control

The more an act transforms reality, the stronger the requirements for:

- mandate;
- authorization;
- attribution;
- evidence;
- review;
- reversibility or compensation.

## 3.10. Native intermittence

For mobile terminals and some domestic nodes, intermittence is normal.

The system SHALL support:

```text
local activity
→ local journal
→ queued transmission
→ reconnection
→ synchronization
→ reconciliation
→ acknowledgement
```

---

# 4. Version 0.1 scope

## 4.1. Included

Version 0.1 SHALL:

1. display known FractaNodes;
2. distinguish observed facts, declared state, and derived state;
3. display the age of every dynamic item;
4. display durable capabilities and currently advertised capabilities;
5. distinguish agent, implementation, instance, session, and host;
6. represent at least one principal subject;
7. represent Gabriel as a personal representative;
8. record minimal mandates;
9. record missions;
10. record acts;
11. classify acts by engagement level;
12. display required authorizations;
13. aggregate existing Packet Attractors;
14. display synchronization state;
15. provide a local view on `rpi3-view`;
16. provide a mobile view;
17. provide a remote private view;
18. provide a filtered public view;
19. continue displaying the last reliable snapshot during disconnection;
20. allow important summaries to be expanded to their sources or evidence;
21. represent a minimal Casa and its physical and digital anchors;
22. represent peer, parent, child, and shared-space Casa relations without assuming a single hierarchy.

## 4.2. Excluded

Version 0.1 SHALL NOT:

- automatically launch every CLI agent;
- merge GitHub, Tailscale, device, and FractaNet identity systems;
- construct a complete cognitive twin;
- decide the principal's interests autonomously;
- assign automatic legal force to mandates;
- manage secret values through the dashboard;
- authorize E4 or E5 acts;
- replace MCP, conversational interfaces, or agent-to-agent protocols;
- become a mandatory central database;
- reveal sensitive network topology publicly;
- assume that a phone is equivalent to its user;
- infer membership in a people, nation, clan, tribe, or Casa from data alone.

---

# 5. Initial observed state

The first instance targets the FractaNet embryo currently composed of:

| Resource ID | Operational name | Initial role |
|---|---|---|
| `resource://fracta` | `fracta` | always-available VPS, public facade, aggregator |
| `resource://i7-thinkpad-jhr` | `i7-thinkpad-jhr` | powerful intermittent host, CLI agents, retrieval |
| `resource://rpi3-view` | `rpi3-view` | permanent local node, La Nasa kiosk, edge store-and-forward |
| `resource://poco-jhr` | `poco-jhr` | mobile terminal, WAN, corpus and intermittent agents |

This is a starting inventory, not a hard-coded list.

The durable registry MUST support nodes unknown to the interface at build time.

The initial personal Casa is provisionally identified as:

```text
casa://jhr
```

This identifier is provisional and not yet canonical.

Possible anchors include:

```text
place://jhr/paoli
resource://rpi3-view
resource://poco-jhr
resource://i7-thinkpad-jhr
repository://JeanHuguesRobert/registre-mariani
repository://JeanHuguesRobert/barons-Mariani
```

An anchor is not the Casa itself.

---

# 6. Minimal conceptual model

## 6.1. `Subject`

A subject is an entity to which identity, interests, roles, mandates, or acts may be attributed.

```yaml
artifactType: control/subject
subject_id: subject:jhr
subject_kind: living-person
display_name: Jean Hugues Robert
status: active
visibility: private
```

Initial `subject_kind` values:

```text
living-person
legal-person
formal-collective
informal-collective
computational-agent
unknown
```

`computational-agent` MUST NOT be used for a mere process or model without a persistent functional identity.

## 6.2. `Casa`

A Casa is a persistent and governed domain that can be inhabited, represented, maintained, and connected to other Casas.

```yaml
artifactType: control/casa
casa_id: casa://jhr
casa_kind: personal
display_name: Casa Jean Hugues
principal_subject_ids:
  - subject:jhr
status: active
visibility: private
governance_ref: policy:casa-jhr-governance
```

Initial `casa_kind` values:

```text
personal
household
family
institutional
collective
people
territorial
project
network
federation
unknown
```

These are working categories, not universal anthropological claims.

A Casa MAY combine several dimensions. Multiple classification values MAY later replace the single `casa_kind` field.

## 6.3. `CasaRelation`

```yaml
artifactType: control/casa-relation
relation_id: casa-relation:01...
source_casa_id: casa://jhr
relation_type: participates-in
target_casa_id: casa://corsica
status: asserted
asserted_by: subject:jhr
visibility: private
```

Initial relation types:

```text
contains
contained-by
participates-in
federates-with
peers-with
shares-space-with
shares-capability-with
shares-corpus-with
hosts
hosted-by
represents
represented-by
derived-from
successor-of
allied-with
```

Relations MUST declare provenance and SHOULD declare whether they are:

```text
self-declared
mutually-acknowledged
legally-established
observed
inferred
disputed
historical
```

## 6.4. `CasaMembership`

Membership is distinct from physical presence, ownership, citizenship, and representation.

```yaml
artifactType: control/casa-membership
membership_id: membership:jhr:casa-jhr
casa_id: casa://jhr
subject_id: subject:jhr
membership_role: inhabitant
status: active
basis: self-declared
```

Initial membership roles:

```text
inhabitant
member
citizen
guest
steward
guardian
representative
operator
service-agent
observer
unknown
```

The semantics of `citizen`, `clan-member`, or other culturally specific roles MUST be defined by the relevant Casa rather than globally imposed.

## 6.5. `CasaAnchor`

```yaml
artifactType: control/casa-anchor
anchor_id: casa-anchor:jhr:paoli
casa_id: casa://jhr
anchor_ref: place://jhr/paoli
anchor_kind: physical-home
status: active
```

Initial anchor kinds:

```text
physical-home
physical-place
territory
device
fractanode
repository
content-addressed-root
identity-root
service
archive
public-facade
private-vault
```

## 6.6. `Role`

A role contextualizes the action of a subject.

```yaml
artifactType: control/role-binding
binding_id: role-binding:jhr:corsica-president
subject_id: subject:jhr
role_id: role:corsica-president
organization_id: subject:corsica-association
status: active
```

A person may act under several roles. The interface SHALL display the active role for every engaging act.

## 6.7. `Agent`

An agent is a representative capable of receiving missions and producing acts.

```yaml
artifactType: control/agent
agent_id: agent:gabriel:jhr
agent_kind: personal-mandatary
principal_subject_ids:
  - subject:jhr
casa_ids:
  - casa://jhr
status: active
```

Initial `agent_kind` values:

```text
personal-mandatary
human-mandatary
legal-representative
ai-agent
collective-agent
service-agent
unknown
```

## 6.8. `AgentImplementation`

The functional identity of an agent is separate from the engine or software used.

```yaml
artifactType: control/agent-implementation
implementation_id: implementation:codex-cli
vendor: OpenAI
product: Codex CLI
implementation_kind: cli
```

`vendor` is descriptive. It grants no legitimacy.

## 6.9. `AgentInstance`

An instance is a concrete incarnation of an agent on a host.

```yaml
artifactType: control/agent-instance
agent_instance_id: agent-instance:codex:i7-thinkpad-jhr
agent_id: agent:codex
implementation_id: implementation:codex-cli
host_resource_id: resource://i7-thinkpad-jhr
runtime_kind: cli
status: available
last_seen: 2026-07-11T08:30:00Z
ttl_seconds: 300
```

## 6.10. `Resource`

A resource is an object, device, service, or computing environment.

```yaml
artifactType: control/resource
resource_id: resource://rpi3-view
resource_kind: fractanode
display_name: rpi3-view
roles:
  - edge-kiosk
  - paoli-anchor
connectivity_mode: intermittent
```

## 6.11. `Place`

A place is distinct from a resource, subject, and Casa.

```yaml
artifactType: control/place
place_id: place://jhr/paoli
place_kind: trusted-home
display_name: 1 cours Paoli
visibility: private
```

“Home” is a material and relational context. It MUST NOT be inferred solely from an IP address or SSID.

## 6.12. `Mandate`

A mandate describes authority delegated by a principal to a representative.

```yaml
artifactType: identity/mandate
mandate_id: mandate:jhr:gabriel:general-assistance
principal_subject_id: subject:jhr
representative_subject_id: agent:gabriel:jhr
representative_kind: personal-mandatary
casa_scope:
  - casa://jhr
status: active
valid_from: 2026-07-11T00:00:00Z
valid_until: null
scope:
  domain: personal-assistance
  allowed_actions:
    - inspect
    - analyze
    - summarize
    - propose
    - delegate-bounded-missions
  forbidden_actions:
    - disclose-secrets
    - publish-without-authorization
    - incur-unbounded-cost
revocation_policy: immediate-by-principal
metadata:
  engagement_ceiling: E2
  delegation_allowed: true
  delegation_must_narrow_scope: true
```

## 6.13. `Mission`

A mission is a concrete request performed under a mandate.

```yaml
artifactType: control/mission
mission_id: mission:fractanet-control-center-v0.1
under_mandate_id: mandate:jhr:gabriel:general-assistance
requested_by_subject_id: subject:jhr
accountable_agent_id: agent:gabriel:jhr
casa_context_ids:
  - casa://jhr
objective: >
  Produce and deploy a first version of the FractaNet Control Center.
status: active
created_at: 2026-07-11T08:00:00Z
```

Initial states:

```text
draft
requested
accepted
active
waiting-authorization
blocked
completed
failed
cancelled
```

## 6.14. `Act`

An act is an attributable transformation or attempted transformation.

```yaml
artifactType: control/act
act_id: act:01...
mission_id: mission:fractanet-control-center-v0.1
actor_agent_instance_id: agent-instance:codex:i7-thinkpad-jhr
accountable_agent_id: agent:gabriel:jhr
casa_context_ids:
  - casa://jhr
verb: repository.file.create
target:
  repository: JeanHuguesRobert/operium
  path: docs/fractanet-control-center.md
engagement_level: E2
authorization_mode: preauthorized-by-mandate
status: completed
occurred_at: 2026-07-11T09:00:00Z
evidence_refs:
  - evidence:git-commit:placeholder
```

## 6.15. `Authorization`

```yaml
artifactType: control/authorization
authorization_id: authorization:01...
act_id: act:01...
granted_by_subject_id: subject:jhr
decision: approved
scope: this-act-only
created_at: 2026-07-11T09:02:00Z
expires_at: 2026-07-11T10:02:00Z
```

Decisions:

```text
approved
rejected
deferred
revoked
expired
```

## 6.16. `Evidence`

```yaml
artifactType: control/evidence
evidence_id: evidence:git-commit:abc123
evidence_kind: git-commit
uri: git:JeanHuguesRobert/operium@abc123
asserts:
  - act:01...
integrity:
  algorithm: sha256
  digest: placeholder
```

Evidence establishes only what it can actually establish.

## 6.17. `AccessContext`

```yaml
artifactType: control/access-context
access_context_id: access-context:01...
subject_id: subject:jhr
interface_resource_id: resource://rpi3-view
place_id: place://jhr/paoli
casa_id: casa://jhr
view_profile: home-authenticated
trust:
  device: resident
  place: trusted
  person_presence: confirmed
  authentication: strong
```

---

# 7. Fractal relations and cooperation

## 7.1. Parent references

Any composable entity MAY reference a parent:

```yaml
parent_ref: mission:parent
```

Minimal relations:

```text
contains
member-of
delegates-to
derived-from
implements
hosted-on
located-at
acts-for
accountable-to
evidences
supersedes
```

## 7.2. Delegation rule

A sub-mandate MUST NOT silently broaden the parent mandate.

```text
scope(sub-mandate) ⊆ scope(parent-mandate)
```

Any extension requires a new mandate from the competent principal.

## 7.3. Multi-scale authorization rule

A local authorization does not override an inherited prohibition.

A local restriction may narrow a higher-level authorization.

An exception SHALL:

- name the overridden rule;
- name the competent authority;
- be bounded;
- be recorded;
- expire or be reviewed.

## 7.4. Multi-peer mission pattern

A mission MAY involve several peers:

```text
principal
→ Gabriel
   → peer A: research
   → peer B: criticism
   → peer C: execution
   → peer D: evidence review
```

The Control Center SHALL preserve:

- each peer's identity;
- each peer's mandate;
- local acts;
- exchanged artifacts;
- disagreements;
- the synthesis process;
- final accountability.

## 7.5. Casa-to-Casa cooperation

A cooperation between Casas SHALL identify:

- participating Casas;
- self-governed boundaries;
- shared purpose;
- shared resources;
- applicable mandates;
- permitted data flows;
- decision rules;
- exit and revocation rules;
- evidence ownership;
- dispute state.

A larger Casa MUST NOT be assumed to own every sub-Casa.

A sub-Casa MUST NOT be assumed independent of every larger obligation.

The exact relation is explicit and contextual.

---

# 8. Capabilities

## 8.1. Durable capability

The durable registry describes what a resource or instance is normally capable of providing.

```yaml
capability_id: capability:code.modify
provider_ref: agent-instance:codex:i7-thinkpad-jhr
status: installed
```

## 8.2. Active capability

A Packet Attractor or heartbeat describes what is offered now.

```yaml
attractor_id: attractor:i7-thinkpad-jhr:codex
capabilities:
  - code.inspect
  - code.modify
  - tests.execute
availability:
  status: online
  last_seen: 2026-07-11T09:00:00Z
  ttl_seconds: 300
```

## 8.3. States

```text
installed
configured
available
degraded
draining
offline-declared
stale
revoked
unknown
```

The dashboard SHALL distinguish:

```text
documented capability
advertised capability
tested capability
recently used capability
```

---

# 9. Engagement levels

| Level | Definition | Examples | Minimum control |
|---|---|---|---|
| `E0` | observation without significant external effect | reading, inventory, calculation | light journal |
| `E1` | local production or draft | report, unapplied patch, draft | traceability |
| `E2` | reversible and inspectable modification | file, local commit, draft PR | valid mission, evidence |
| `E3` | significant external effect | push, publication, message, deployment | explicit authorization or precise mandate |
| `E4` | legal, financial, or difficult-to-reverse effect | payment, signature, rights transfer | dual validation and strong evidence |
| `E5` | critical physical, vital, or systemic effect | physical safety, critical infrastructure | prohibited by default in v0.1 |

Classification depends on:

- verb;
- target;
- scope;
- publicity;
- reversibility;
- cost;
- number of affected subjects;
- uncertainty;
- applicable mandate;
- affected Casas.

Version 0.1 MAY propose a level. It SHALL allow human correction.

---

# 10. Events

The system uses an append-only event log.

Minimal events:

```text
control/resource.observed
control/resource.state-changed

control/casa.declared
control/casa.state-changed
control/casa.relation-declared
control/casa.membership-declared
control/casa.membership-revoked
control/casa.anchor-attached
control/casa.anchor-detached

control/agent.declared
control/agent-instance.observed
control/agent-instance.state-changed

identity/mandate.created
identity/mandate.activated
identity/mandate.suspended
identity/mandate.revoked
identity/mandate.expired

control/mission.requested
control/mission.accepted
control/mission.started
control/mission.delegated
control/mission.blocked
control/mission.completed
control/mission.failed
control/mission.cancelled

control/act.proposed
control/act.authorization-required
control/act.authorized
control/act.rejected
control/act.started
control/act.committed
control/act.failed
control/act.compensated

control/evidence.attached
control/alert.raised
control/alert.acknowledged
control/sync.started
control/sync.completed
control/sync.conflict
```

Existing Packet Attractor events are consumed without renaming:

```text
cop/attractor.advertised
cop/attractor.withdrawn
cop/attractor.matched
cop/attractor.rejected
cop/attractor.degraded
```

## 10.1. Minimal envelope

```json
{
  "event_id": "event:01...",
  "event_type": "control/act.committed",
  "occurred_at": "2026-07-11T09:00:00Z",
  "observed_at": "2026-07-11T09:00:03Z",
  "origin_ref": "resource://i7-thinkpad-jhr",
  "subject_ref": "act:01...",
  "correlation_id": "mission:fractanet-control-center-v0.1",
  "causation_id": "event:previous",
  "casa_context_ids": ["casa://jhr"],
  "payload": {},
  "visibility": "private"
}
```

---

# 11. Sources of truth and projections

## 11.1. Durable sources

Initial durable sources are:

- public Operium YAML registries;
- the private `registre-mariani` registry;
- COP events;
- JSONL journals;
- Git references;
- Markdown decisions and records;
- Casa manifests.

## 11.2. Control Center projection

The aggregator builds a derived snapshot:

```json
{
  "schema": "fractanet-control-snapshot@v0.1",
  "generated_at": "2026-07-11T09:00:00Z",
  "view_profile": "home-authenticated",
  "degraded": false,
  "sources": [],
  "casas": [],
  "nodes": [],
  "agents": [],
  "mandates": [],
  "missions": [],
  "acts": [],
  "alerts": [],
  "sync": {}
}
```

The snapshot is never canonical.

## 11.3. Freshness

Every dynamic object SHALL expose:

```yaml
observed_at:
last_seen:
ttl_seconds:
freshness:
  state: fresh | aging | stale | unknown
  age_seconds:
```

No blue indicator may remain visible without an age or freshness statement.
Blue means "stable", "normal", "calm", "cold", "peace", "sleep".
Read means "unstable", "exceptionnal", "troubled", "hot", "crisis".
Orange means "alive", "active"", "energetic", "current/relevant", "on going", "processing", etc.
Yellow means "meta", "abstract", "immaterial", "spiritual", "rules", "doctrinal".
Pink means "diversity", "alternatives", "critical thinking", "biological", "wise/astute", "flesh", "skin in the game", "human", "altruism"

---

# 12. Technical architecture

```text
Operium public registry ─────────────┐
registre-mariani private registry ───┤
Casa manifests ──────────────────────┤
Tailscale / SSH probes ──────────────┤
Packet Attractor blackboard ─────────┤
COP / JSONL events ──────────────────┤
Git evidence adapters ───────────────┘
                                     │
                                     ▼
                     fractanet-control-aggregator
                              on fracta
                                     │
                        view-filtered snapshots
                                     │
             ┌───────────────────────┼───────────────────────┐
             ▼                       ▼                       ▼
       rpi3-view kiosk        mobile/private client      public view
          La Nasa              store-and-forward         read-only
```

## 12.1. Aggregator

Working name:

```text
fractanet-control-aggregator
```

Responsibilities:

- read registries;
- read events;
- read the blackboard;
- read Casa manifests;
- run authorized probes;
- calculate freshness;
- build projections;
- apply visibility filters;
- never expose secret values;
- retain source references.

## 12.2. Interface

Working name:

```text
fractanet-control-view
```

Constraints:

- lightweight web application;
- usable on Raspberry Pi 3;
- no GPU requirement;
- kiosk mode;
- last-snapshot cache;
- no mandatory heavy framework;
- complete keyboard navigation;
- screen-reader compatibility;
- textual expression of every state.

## 12.3. Store-and-forward

Working name:

```text
fractanet-control-outbox
```

Possible initial implementation:

- SQLite where available;
- append-only JSONL in constrained environments;
- unique identifiers;
- monotonic local sequence;
- previous-event hash;
- acknowledgement;
- idempotent deduplication.

---

# 13. API contract v0.1

## 13.1. Read API

```http
GET /control/v1/snapshot
GET /control/v1/casas
GET /control/v1/casas/{casa_id}
GET /control/v1/nodes
GET /control/v1/agents
GET /control/v1/mandates
GET /control/v1/missions
GET /control/v1/acts
GET /control/v1/alerts
GET /control/v1/sync
GET /control/v1/evidence/{evidence_id}
```

Common parameters:

```text
view_profile
casa_id
since
limit
status
freshness
visibility
```

## 13.2. Write API

```http
POST /control/v1/events
POST /control/v1/missions
POST /control/v1/authorizations
POST /control/v1/suspensions
POST /control/v1/acknowledgements
```

Writes SHALL be:

- authenticated;
- attributed;
- idempotent;
- journaled;
- bounded by the access profile;
- rejected when an engaging act lacks a verifiable mandate.

## 13.3. Common response

```json
{
  "ok": true,
  "generated_at": "2026-07-11T09:00:00Z",
  "view_profile": "mobile-private",
  "degraded": false,
  "warnings": [],
  "source_freshness": {},
  "data": {}
}
```

## 13.4. Functional errors

```text
CONTROL_INVALID_SCHEMA
CONTROL_UNAUTHENTICATED
CONTROL_UNAUTHORIZED
CONTROL_MANDATE_MISSING
CONTROL_MANDATE_EXPIRED
CONTROL_ENGAGEMENT_CEILING
CONTROL_STALE_STATE
CONTROL_CONFLICT
CONTROL_SOURCE_UNAVAILABLE
CONTROL_VISIBILITY_DENIED
CONTROL_IDEMPOTENCY_CONFLICT
CONTROL_CASA_BOUNDARY_DENIED
CONTROL_CASA_MEMBERSHIP_UNVERIFIED
```

---

# 14. View profiles

## 14.1. `home-ambient`

A screen visible in the physical home without an active authenticated session.

May show:

- general state;
- mission count;
- non-sensitive alerts;
- physical-home state;
- aggregate synchronization state.

Must not show:

- private content;
- network addresses;
- sensitive mission titles;
- third-party names;
- secrets;
- legal, medical, or intimate requests.

## 14.2. `home-authenticated`

Presence and authentication are confirmed.

May show:

- private missions;
- acts;
- evidence;
- authorization requests;
- detailed FractaNet state;
- physical Casa anchors;
- private Casa relations.

## 14.3. `mobile-private`

A concise view optimized for:

- alerts;
- decisions;
- capture;
- missions;
- synchronization;
- emergency suspension.

## 14.4. `remote-private`

Access from a non-resident terminal.

Constraints:

- strong authentication;
- limited session duration;
- no implicit trust in the place;
- minimal cache;
- masked secrets;
- critical actions prohibited.

## 14.5. `accredited`

A view for an authorized partner or peer Casa.

It exposes only:

- shared resources;
- authorized capabilities;
- joint missions;
- relevant acts and evidence;
- states required for cooperation;
- applicable shared-space or federation rules.

## 14.6. `public`

A strictly filtered view.

Potentially admissible information:

```text
number of registered nodes;
number of public capabilities currently available;
public missions;
verifiable public acts;
public incidents;
general health without sensitive topology.
```

---

# 15. La Nasa interface

## 15.1. Main screen

```text
FRACTANET — LA NASA
Paoli Control Station

Regime: NORMAL
Last update: 18 seconds ago
View: HOME AUTHENTICATED
Casa: Casa Jean Hugues

CASAS
1 active · 3 anchors · 2 peer relations

NODES
4 registered · 3 fresh · 1 intermittent

AGENTS
Gabriel active
Codex available on ThinkPad
Claude available on POCO
Grok state is stale

MISSIONS
2 active · 1 blocked · 1 decision required

ENGAGING ACTS
1 E3 authorization required
3 E2 acts today
0 E4/E5 acts

SYNCHRONIZATION
POCO: 7 local events pending
Pi: synchronized
fracta: available

ALERTS
ThinkPad: low disk space
One act trace is incomplete
```

## 15.2. Semantic zoom

The interface SHALL support:

```text
FractaNet
→ Casa
→ subject or collective
→ mission
→ agent
→ act
→ evidence
→ fine trace
```

Panel vocabulary and structure SHALL remain coherent at each level.

## 15.3. Alerts

An alert SHALL always provide:

- object;
- severity;
- reason;
- freshness;
- source;
- possible action;
- uncertainty.

An alert MUST NOT be created merely because an intermittent node is offline.

---

# 16. Mobile interface

## 16.1. Home

```text
CASA JEAN HUGUES / GABRIEL

General state: normal
1 decision required
3 active missions
Paoli anchor: online
Last synchronization: 4 min ago

[Decide]
[Talk to Gabriel]
[Capture]
[View missions]
[Suspend]
```

## 16.2. Offline state

An offline action SHALL display its exact state:

```text
recorded locally
pending transmission
transmitted
received
executed
evidence received
conflict
```

The phone MUST NOT display “executed” before receiving execution evidence or acknowledgement.

## 16.3. Multiple phones

The model SHALL support several devices for one subject:

```text
device:poco-jhr-personal
device:jhr-professional-phone
device:jhr-tablet
```

Each device has:

- its own key;
- status;
- rights;
- bounded local mandates;
- enrollment date;
- independent revocation.

---

# 17. Physical home, Casa, and digital twins

## 17.1. Physical home

The dashboard MAY display an industrial digital twin of a place or its equipment:

- network;
- energy;
- temperature;
- equipment;
- incidents;
- maintenance.

## 17.2. Casa

The Casa is the persistent domain of a subject or collective in FractaNet.

It may contain or reference:

- identity;
- corpus;
- mandates;
- Gabriel;
- missions;
- acts;
- evidence;
- informational assets;
- cogentigrams;
- private and public fragments;
- physical places;
- devices;
- repositories;
- peer Casas.

The dashboard is a window into the Casa. It is not the Casa itself.

## 17.3. Cognitive twin

A cognitive twin is distinct from an industrial digital twin.

It is built from cogentigrams: partial, sourced, revisable, and approximate maps of cognition.

Version 0.1 SHALL NOT attempt to produce a psychological state of a person.

It MAY display metadata about representations:

```text
number of maps;
last revision date;
confidence;
open contradictions;
unintegrated sources.
```

## 17.4. Casa and cognitive twin are distinct

```text
Casa
≠ cognitive twin
≠ corpus
≠ repository
≠ Gabriel
```

A Casa may host or reference several cognitive representations.

A Gabriel may use them.

Neither replaces the living subject.

---

# 18. Palettes and accessibility

## 18.1. Mondrian palette

Semantic domain: operation, structure, control, decision.

Colors:

```text
primary: red
secondary: yellow
tertiary: blue
```

Canonical hexadecimal values are not yet specified.

## 18.2. YanUg palette

Semantic domain: living beings, presence, relationship, proximity.

Colors:

```text
primary: orange
secondary: blue
tertiary: pink
```

Pink is remembered as the pink of a bullfighter's stockings.

Canonical hexadecimal values are not yet specified.

## 18.3. Separation rule

The Mondrian palette primarily describes operational state.

The YanUg palette primarily describes living subjects, their presence, and their relationships.

Example:

```text
poco-jhr as a machine:
  resource shape + Mondrian operational state

proximity relation to Jean Hugues:
  YanUg relation encoding

synchronization state:
  symbol + text + Mondrian operational state
```

## 18.4. Accessibility

Color MUST NOT be the sole information channel.

Every colored state SHALL also be expressed through one or more of:

- text;
- shape;
- symbol;
- pattern;
- position;
- border;
- thickness;
- sound or speech.

Example:

| State | Shape | Symbol | Text |
|---|---|---|---|
| nominal | circle | `✓` | Available |
| attention | triangle | `!` | Attention |
| critical | octagon | `×` | Blocked |
| offline | empty circle | `○` | Offline |
| synchronizing | double arrows | `⇄` | Synchronizing |
| local queue | box | `↑` | Events pending |

Requirements:

- high contrast;
- high-legibility mode;
- configurable sizes;
- keyboard navigation;
- screen-reader support;
- no hover-only information;
- disableable animations;
- no fast flashing;
- optional spoken important alerts;
- visual testing for several forms of color-vision deficiency.

---

# 19. Security and safety

## 19.1. Public/private separation

Secret values MUST NOT appear in public snapshots.

Views MAY expose references such as:

```text
secret://resource-name
```

but not values.

## 19.2. Least mandate

An agent adapter receives only:

- the mission;
- necessary tools;
- necessary targets;
- engagement ceiling;
- required duration;
- relevant Casa boundary.

## 19.3. Revocation

The system SHALL support:

- suspending an instance;
- withdrawing an attractor;
- revoking a mandate;
- declaring a device lost;
- invalidating its authorizations;
- retaining revocation evidence;
- detaching a compromised Casa anchor.

## 19.4. Lost phone

Phone loss is a normal event to design for.

A phone SHALL NOT contain the sole copy of:

- the Casa root key;
- the corpus;
- evidence of an act;
- a critical irrevocable mandate.

## 19.5. Non-sovereign dashboard

Compromising the dashboard SHALL NOT be sufficient to:

- modify durable sources;
- broaden a mandate;
- perform an E4 or E5 act;
- reveal secrets;
- permanently revoke a Casa;
- assign or remove membership in a people or collective.

## 19.6. No inferred sovereignty

The system MUST NOT infer that:

- a device owner is a Casa owner;
- an administrator is a political representative;
- a resident is a member;
- a member consents to every collective act;
- a majority view erases minority views;
- a legal person has the same cognition as its officers;
- a collective has a single unified will unless its governance establishes one for the relevant decision.

## 19.7. Cultural and political safety

When representing peoples, Indigenous nations, clans, tribes, or communities:

- use self-designations where available;
- preserve disputed names and boundaries;
- record the source of membership claims;
- avoid reducing political identity to ethnicity;
- avoid treating state recognition as the only possible legitimacy;
- avoid treating self-assertion as sufficient for rights over other subjects;
- permit plural and overlapping affiliations;
- preserve dissent and non-consent.

---

# 20. Initial deployment

## 20.1. `fracta`

Initial responsibilities:

- host the aggregator;
- read the blackboard;
- serve filtered views;
- retain received events;
- expose the API through the existing perimeter.

## 20.2. `rpi3-view`

Initial responsibilities:

- kiosk mode;
- last-snapshot cache;
- local display;
- store-and-forward;
- degraded operation;
- no critical secrets;
- automatic restart recovery.

## 20.3. `i7-thinkpad-jhr`

Initial responsibilities:

- declare CLI agents;
- produce heartbeats;
- emit mission and act events;
- provide Git evidence;
- report local limits.

## 20.4. `poco-jhr`

Initial responsibilities:

- mobile interface;
- local journal;
- outbox;
- synchronization;
- mobile instance declarations;
- notifications;
- independent revocation.

---

# 21. Proposed repository tree

```text
operium/
├── docs/
│   └── fractanet-control-center-v0.1.md
├── schemas/
│   └── control/
│       ├── subject.schema.json
│       ├── casa.schema.json
│       ├── casa-relation.schema.json
│       ├── casa-membership.schema.json
│       ├── casa-anchor.schema.json
│       ├── role-binding.schema.json
│       ├── agent.schema.json
│       ├── agent-instance.schema.json
│       ├── mission.schema.json
│       ├── act.schema.json
│       ├── authorization.schema.json
│       ├── evidence.schema.json
│       └── access-context.schema.json
├── apps/
│   └── control-center/
│       ├── server/
│       └── public/
├── lib/
│   └── control/
│       ├── aggregate.js
│       ├── freshness.js
│       ├── visibility.js
│       ├── engagement.js
│       ├── casa-boundaries.js
│       └── evidence.js
├── registry/
│   └── examples/
│       ├── subjects.yaml
│       ├── casas.yaml
│       ├── agents.yaml
│       ├── mandates.yaml
│       └── missions.yaml
└── scripts/
    └── ops/
        ├── install-control-aggregator.sh
        └── install-la-nasa-kiosk.sh
```

Provisional schemas may later be replaced by, or referenced from, canonical COP schemas in Inseme.

---

# 22. Implementation phases

## Phase 0 — Static snapshot

- read an example YAML file;
- display the four nodes;
- display the initial Casa and anchors;
- display agents;
- display missions and acts;
- apply view profiles;
- validate baseline accessibility.

## Phase 1 — Dynamic state

- integrate the blackboard;
- integrate heartbeats;
- calculate TTL and freshness;
- display state alerts;
- retain the last snapshot on the Pi.

## Phase 2 — Missions and acts

- receive events;
- load missions;
- display acts;
- associate Git evidence;
- classify E0 through E3;
- highlight required authorizations.

## Phase 3 — Mobile store-and-forward

- local outbox;
- idempotent identifiers;
- synchronization;
- acknowledgements;
- conflicts;
- device revocation.

## Phase 4 — Agent adapters

- Codex;
- Claude;
- Grok;
- human agents;
- normalized events;
- mandate limits.

## Phase 5 — Fractal cooperation

- sub-mandates;
- peer missions;
- Casa-to-Casa cooperation;
- cross-review;
- accredited views;
- attestations;
- expandable aggregation.

---

# 23. Tests

## 23.1. Data tests

- validate each schema;
- validate references;
- detect expired mandates;
- reject sub-mandate broadening;
- enforce event idempotency;
- deduplicate events;
- validate Casa relation provenance;
- distinguish membership from presence.

## 23.2. Freshness tests

- fresh node;
- aging node;
- stale node;
- inconsistent clock;
- missing heartbeat;
- explicit withdrawal.

## 23.3. Visibility tests

- ambient home view;
- authenticated home view;
- mobile view;
- remote private view;
- accredited view;
- public view;
- absence of secrets in every view;
- absence of unauthorized Casa relationship disclosure.

## 23.4. Store-and-forward tests

- offline creation;
- restart;
- reconnection;
- retransmission;
- duplicate;
- reordered events;
- conflict;
- acknowledgement after session expiry.

## 23.5. Engagement tests

- E0 without authorization;
- E2 under mandate;
- E3 requiring a decision;
- explicitly authorized E3;
- rejected E4;
- rejected E5.

## 23.6. Accessibility tests

- keyboard navigation;
- screen reader;
- zoom;
- high-legibility mode;
- no color-only meaning;
- color-vision deficiency simulation;
- animations disabled;
- remote display on the Pi screen.

## 23.7. Degradation tests

- `fracta` unavailable;
- Pi without WAN;
- phone offline;
- ThinkPad offline;
- private registry inaccessible;
- empty blackboard;
- stale data;
- unavailable evidence.

## 23.8. Casa-safety tests

- a resident is not automatically made a member;
- a device is not automatically made an owner;
- a child Casa does not inherit every parent permission;
- a parent Casa cannot silently absorb a child Casa;
- overlapping Casas preserve separate mandates;
- disputed membership remains disputed;
- an inferred ethnic or cultural link cannot create membership;
- a collective act retains dissenting positions where recorded.

---

# 24. Acceptance criteria v0.1

Version 0.1 is accepted when:

1. the Pi displays the four nodes from a registry, without a hard-coded list;
2. dynamic state displays age and freshness;
3. a node exceeding its TTL becomes `stale`;
4. machine, agent, implementation, and instance are separate;
5. Gabriel is represented as a representative, not as a model;
6. a mission can be loaded from YAML or JSON;
7. at least three acts are displayed;
8. an E3 act creates a required decision;
9. E4 and E5 acts are rejected by default;
10. every act can reference evidence;
11. the public view masks private data and sensitive topology;
12. the Pi displays the last snapshot when `fracta` is unavailable;
13. the phone can record an offline event and synchronize it;
14. a retransmitted event is not applied twice;
15. every colored state has a non-color expression;
16. the dashboard distinguishes `offline`, `stale`, `rejected`, and `unknown`;
17. no view identifies a person with a phone;
18. no view presents a cogentigram as actual cognition;
19. the source of every important synthesis can be inspected;
20. limits and open questions remain visible;
21. `Casa` remains untranslated and explicitly defined;
22. the initial Casa is represented independently from its home, phone, Pi, repositories, and Gabriel;
23. at least one Casa anchor and one Casa relation can be displayed;
24. membership, residence, ownership, and representation are distinct;
25. no Casa membership is created from behavioral inference alone.

---

# 25. Open questions

These questions do not block Phase 0.

## 25.1. Schema authority

Should v0.1 schemas remain provisionally in Operium, or should canonical versions immediately be created in `inseme/packages/cop-core`?

**Working assumption:** prototype in Operium, migrate to COP after validation.

## 25.2. Event storage

Initial choice between:

- JSONL;
- SQLite;
- existing COP journal;
- JSONL plus SQLite projection.

**Working assumption:** canonical JSONL with a lightweight local projection.

## 25.3. Authentication

Should v0.1 use:

- Tailscale as the private perimeter;
- application-level authentication;
- both?

**Working assumption:** Tailscale for private transport, application authentication for views and writes.

## 25.4. Presence detection

Which signals may confirm that Jean Hugues is physically at Paoli?

Presence MUST NOT be inferred from a single signal.

**Working assumption:** no automatic presence in Phase 0; explicit authentication.

## 25.5. Exact palette values

Canonical Mondrian and YanUg shades remain to be recovered from the corpus or earlier graphic material.

**Working assumption:** semantic tokens without final colors.

## 25.6. Casa identifier

Candidate:

```text
casa://jhr
```

The URI scheme is not yet canonical.

## 25.7. Casa ontology

Should `personal`, `household`, `family`, `institutional`, `people`, and `territorial` be exclusive kinds, composable facets, or roles applied to the same Casa?

**Working assumption:** single working kind in v0.1, migrate to composable facets later.

## 25.8. Casa boundary authority

Who may declare, dispute, recognize, federate, or dissolve a Casa?

**Working assumption:** declarations are provenance-bearing claims; recognition by one actor does not automatically bind another.

## 25.9. Indigenous and collective governance

How should FractaNet import the self-defined political and kinship structures of a people without forcing them into a universal Western ontology?

**Working assumption:** minimal global primitives, locally defined vocabularies, explicit mappings, no automatic equivalence.

## 25.10. Role of the `gabriel` repository

Should it become the reference implementation of Gabriel or remain one application among several?

**Working assumption:** reference implementation, with doctrine elsewhere.

## 25.11. Private registry

Which parts belong in `registre-mariani`, and which may be public with masked values?

**Working assumption:** public structure where safe; actual devices, topology, mandates, and sensitive relations remain private.

## 25.12. Offline authorizations

May an E3 authorization granted offline execute after reconnection without additional confirmation?

**Working assumption:** only if bounded, unexpired, tied to one act, and the target state has not materially changed.

## 25.13. Multi-peer operation

The full format for cooperation among several Gabriels and Casas will follow the mono-principal vertical slice.

---

# 26. Implementation invariants

```text
No identity without provenance.
No representation without uncertainty status.
No capability treated as a right.
No mandate without status and revocation.
No engaging act without a verifiable mandate.
No act without attribution.
No synthesis without expandability.
No color as the sole information channel.
No intermittence treated as permanent failure.
No dashboard promoted to central truth.
No sub-mandate broader than its parent without new authority.
No person identified with a terminal.
No cognitive twin identified with a person.
No Casa identified with a building, device, repository, or dashboard.
No residence identified with membership.
No ownership identified with governance.
No collective identified with unanimity.
No people or Indigenous nation reduced to an externally assigned category.
```

---

# 27. Expected result of the first iteration

The first iteration should not be judged by feature count.

It should demonstrate that the FractaNet embryo can become observable through a coherent structure:

```text
principal
→ mandate
→ representative
→ mission
→ executing agent
→ act
→ evidence
→ control
```

inside and across:

```text
Casa
→ sub-Casa
→ peer Casa
→ wider FractaNet
```

while remaining:

- local when possible;
- distributed when necessary;
- fractal in composition;
- accessible;
- revisable;
- provider-independent;
- faithful to autonomy of capacity;
- respectful of living subjects and self-governed collectives.

---

# Appendix A — Terminological verification note

This appendix records the historical checks that motivated the `Casa` terminology policy.

1. The standard English expression in *Dune* is **House Atreides**; the feudal order includes **Great Houses**.
2. English `house` has long denoted both a dwelling and a family or lineage.
3. Classical Latin `casa` primarily referred to a hut or modest dwelling and became the common Romance source for words meaning “house.”
4. Roman household and lineage concepts were distributed across distinct terms, notably `domus`, `familia`, and `gens`.
5. English `inhabit` derives through Latin `inhabitare`, built on `habitare`, related to repeated dwelling and ultimately to `habere`, “to have” or “to hold.”
6. The FractaNet concept of Casa is therefore a deliberate modern synthesis, not a claim that one ancient word already encoded the complete model.
7. Indigenous peoples, tribal nations, clans, and communities use diverse self-designations and governance forms. FractaNet must preserve those distinctions rather than force a universal equivalence.

The normative consequence is simple:

> The system may reuse structural primitives across scales, but it must preserve the provenance, self-definition, and ontological differences of the entities being represented.
