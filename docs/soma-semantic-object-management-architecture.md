---
title: "SOMA — Semantic Object Management Architecture"
description: "A lightweight semantic model for describing, observing, and operating managed objects with modern representations and transports."
layout: default
date: 2026-07-28
last_modified_at: 2026-07-28
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/soma-semantic-object-management-architecture.md
document_role: "architecture"
document_kind: "specification"
visibility: "public"
lifecycle_state: "working"
---

# SOMA — Semantic Object Management Architecture

> Rich semantics, simple mechanisms.

## Status

This document is an initial working specification. It defines the semantic
core of SOMA. JSON examples and candidate projections illustrate the model;
they are not yet frozen wire formats.

SOMA is a lightweight semantic architecture for describing, observing, and
operating managed objects. It deliberately separates meaning from syntax,
storage, transport, and presentation.

## 1. Purpose

A SOMA object can state:

- what it is;
- how it is identified and labelled;
- what attributes it exposes;
- what state is desired and observed;
- what it contains and relates to;
- what it can do;
- what events it can report;
- when, where, and how its observations were produced.

The same semantic object may be projected through JSON, HTML, SQLite, MCP,
metrics, event feeds, or legacy management adapters without changing the
meaning of its attributes.

SOMA is intended to support very small implementations. A static JSON
document remains a valid SOMA projection. No central database, graph database,
message bus, or permanent network connection is required.

## 2. Name and metaphor

**SOMA** means **Semantic Object Management Architecture**.

The Greek word *sôma* (σῶμα) means body. The metaphor is intentional: SOMA
describes the observable and actionable body of a node, service, device, or
other managed entity—its identity, parts, capabilities, state, vital signs,
signals, and possible actions.

## 3. Historical lineage

SOMA does not revive a legacy protocol. It retains useful semantic lessons
while using contemporary representations and transports.

### 3.1 SNMP and SMI

SNMP and its Structure of Management Information demonstrated the value of:

- a shared management vocabulary;
- independently defined, reusable attributes;
- semantic application types such as counters, gauges, time ticks, and human
  labels;
- a clear distinction between an object identifier and a friendly label;
- simple observation, notification, and legacy-device interoperability.

SOMA retains semantic attribute definitions and behavioural value types. It
does not adopt opaque numeric OID trees as its primary human-facing identity
system.

### 3.2 CMIS, CMIP, and GDMO

The OSI management model contributed a richer managed-object model:

- managed object classes and instances;
- typed attributes;
- behaviour;
- actions and notifications;
- reusable packages, including conditional packages;
- naming, containment, scope, filtering, and relationships;
- operations over one object or a selected set of objects.

SOMA retains this conceptual richness but rejects dependence on the OSI stack,
ASN.1 encodings, or a single heavyweight protocol.

### 3.3 SIP and SDP

SIP and SDP demonstrated useful separation between:

- durable identity and current contact location;
- participants and transient sessions;
- capability description and session negotiation;
- control signalling and the media or data plane;
- extensible, inspectable messages and intermediaries.

SOMA adopts the distinction between an object's durable identity, its current
endpoints, its advertised capabilities, and transient interactions. SOMA is
not a session-initiation protocol.

### 3.4 MGCP

MGCP modelled decomposed media gateways as collections of named physical or
virtual endpoints controlled by a Call Agent. It separated call-control
intelligence from media functions and defined:

- endpoints and connections;
- packages that extend endpoint behaviour;
- requested event detection;
- generated signals and notifications;
- endpoint and connection audit;
- explicit service state and restart reporting.

This is directly relevant to SOMA's composability, capability packages,
observable events, requested actions, audit views, and separation between a
controller and a constrained adapter. SOMA does not inherit MGCP's
master/slave assumption as a universal topology: authority MUST be explicit
and MAY be local, delegated, shared, or absent.

### 3.5 Modern projections

SOMA expects modern implementations to use technologies such as:

- JSON and JSON Schema for interchange and validation;
- HTTP for retrieval and operations;
- SQLite for local working memory and reconstructible views;
- HTML for human-readable node presentation;
- MCP for agent-facing resources and actions;
- Prometheus-compatible metrics for numeric telemetry;
- Atom, RSS, SSE, or other feeds for notifications;
- SNMP adapters for established equipment.

These are projections and adapters, not the semantic source of truth.

## 4. Design principles

### 4.1 Semantics before syntax

An attribute has the same meaning regardless of its JSON shape, database
column, MCP resource, HTML rendering, or metric representation.

### 4.2 One class per object

Every managed object is an instance of exactly one managed class. A class MAY
extend at most one other class.

SOMA favours simple inheritance, reusable facets, and containment over
multiple inheritance. This is consistent with the object-oriented dialect of
Inox, which also uses single inheritance.

### 4.3 Composition through facets

A facet is a reusable semantic package of attributes, actions,
notifications, and invariants. Facets provide composition without claiming
that an object belongs to several class hierarchies.

### 4.4 Containment creates manageable structure

A complex object SHOULD contain smaller managed objects when those parts have
their own identity, lifecycle, state, observations, or actions.

Containment expresses ownership and lifecycle. Other associations MUST use
explicit references rather than pretend to be containment.

### 4.5 Identity is not presentation

A stable identity MUST NOT depend on a mutable friendly name.
`core.user-label` is human-assigned, non-identifying, non-unique, and
modifiable.

### 4.6 Observation is contextual

An observed value is incomplete without enough context to interpret it.
Observations SHOULD carry time, source, freshness, and quality. Resettable
monotonic values SHOULD also identify their incarnation or reset boundary.

### 4.7 Desired state is not observed state

Configuration or intent MUST remain distinguishable from measured operational
state. Reconciliation is an operation performed by an implementation, not an
implicit property of the data format.

### 4.8 Local-first and intermittently connected

Objects MUST remain describable and inspectable without a permanent central
service. Projections MAY be cached, replicated, regenerated, or served in a
degraded local mode.

## 5. Core metamodel

```text
ManagedClass
  identity
  extends: 0..1 ManagedClass
  includes: 0..n Facet
  contains: 0..n ContainmentRule

ManagedObject
  identity
  class
  schema
  attributes
  children
  references
  capabilities
  actions
  notifications

Facet
  identity
  attributes
  actions
  notifications
  invariants

AttributeDefinition
  identity
  meaning
  value_type
  behaviour_type
  unit
  cardinality
  access
  observation_policy

Observation
  attribute
  value
  observed_at
  source
  freshness
  quality
  incarnation
```

Normative keywords such as MUST, SHOULD, and MAY currently express design
intent. A later standards-track revision may bind them to a formal conformance
profile.

## 6. Classes, instances, facets, and children

Example class composition:

```text
operium.Node extends soma.ManagedObject
operium.Node includes:
  core.UserLabelled
  state.Operational
  health.Reporting
  sampling.ResourceUsage
```

Example instance containment:

```text
node:rpi3-view
├── interface:eth0
├── filesystem:root
├── service:operium-portal
└── process:portal-server
```

Each child is independently identifiable and MAY expose its own attributes,
observations, actions, notifications, and children.

## 7. Semantic attributes

An attribute definition is independent of the classes that use it. Classes
and facets declare applicability; they do not redefine meaning.

Example definition:

```json
{
  "id": "core.user-label",
  "valueType": "string",
  "semantics": "Human-assigned, non-unique and non-identifying label",
  "access": "read-write",
  "cardinality": "0..1"
}
```

Example occurrence:

```json
{
  "id": "node:rpi3-view",
  "class": "operium.node",
  "attributes": {
    "core.user-label": "Raspberry Pi du bureau"
  }
}
```

The example value is local operator data and may be localized. Canonical
attribute identifiers and public specifications remain language-neutral.

### 7.1 Initial common attributes

The initial vocabulary SHOULD explore at least:

```text
core.user-label
core.description
core.tags

identity.serial-number
identity.version
identity.manufacturer

lifecycle.created-at
lifecycle.incarnation
lifecycle.last-changed-at

state.administrative
state.operational
state.availability
state.health

observation.observed-at
observation.source
observation.freshness
observation.quality

containment.parent
containment.position
```

Only `identity`, `class`, and `schema` are candidates for the mandatory
object kernel. Other attributes are supplied through applicable facets.

## 8. Value and behaviour types

SOMA distinguishes representation from temporal or operational behaviour.

### 8.1 Value types

Initial value types:

```text
Boolean
Integer
UnsignedInteger
Decimal
String
Enumeration
Timestamp
Duration
Identity
Reference
Quantity(unit)
StructuredValue
```

### 8.2 Behaviour types

Initial behaviour types:

| Type | Semantics |
| --- | --- |
| `Static` | Expected to remain stable for an object's incarnation |
| `Configuration` | Desired or administratively supplied value |
| `State` | Current member of a defined state space |
| `Gauge` | Instantaneous value that may increase or decrease |
| `Counter` | Cumulative monotonic value within an incarnation |
| `Rate` | Change per defined unit of time |
| `Accumulator` | Aggregated value with a documented reset policy |
| `Sample` | Individual time-bound observation |
| `Distribution` | Population of observations or buckets |
| `Event` | Discrete occurrence rather than persistent state |

A `Counter` is not merely an unsigned integer. Its contract includes
monotonicity within an incarnation, a defined unit, and reset semantics.

```json
{
  "attribute": "network.bytes-received",
  "valueType": "uint64",
  "behaviourType": "counter",
  "unit": "byte",
  "value": 1837462,
  "observedAt": "2026-07-28T16:32:00Z",
  "incarnation": "boot:91d7"
}
```

## 9. Sampling and observations

Whether an attribute is meaningfully sampleable belongs to its semantic
definition. The actual schedule belongs to local policy.

```json
{
  "id": "system.cpu.utilization",
  "valueType": "decimal",
  "behaviourType": "gauge",
  "unit": "percent",
  "sampling": {
    "supported": true,
    "recommendedInterval": "PT30S",
    "retentionHint": "PT24H"
  }
}
```

An observation:

```json
{
  "attribute": "system.cpu.utilization",
  "value": 17.4,
  "observedAt": "2026-07-28T16:33:00Z",
  "source": "node:rpi3-view/collector:local",
  "quality": "measured"
}
```

Sampling metadata is guidance, not a command. Operium, an Inox ReactiveSet,
or another collector decides when to sample, retain, aggregate, replicate, or
discard observations.

## 10. Actions and notifications

An action definition SHOULD state:

- semantic identity;
- target class or facet;
- input and result types;
- preconditions;
- expected effects;
- authority requirements;
- idempotency and retry semantics;
- possible failures.

A notification definition SHOULD state:

- semantic identity;
- emitting class or facet;
- triggering condition;
- payload;
- ordering and delivery expectations;
- whether state can be reconstructed without receiving it.

### 10.3 Notification-directed retrieval

SOMA adopts the useful combination historically found in SNMP
trap-directed polling and the Notification Log MIB:

1. the producer durably appends an event to a bounded local journal;
2. it attempts to push a compact notification containing the journal
   identity, producer incarnation, and monotonically increasing sequence;
3. the consumer compares that cursor with the last contiguous sequence it
   has observed;
4. a gap, reconnect, or interesting notification directs the consumer to
   retrieve journal entries from the producer;
5. normal polling remains a fallback because a notification is a hint, not
   proof that all earlier events were delivered.

Each journal projection SHOULD expose:

- `journal_id` and `producer_incarnation`;
- `first_available_sequence`, `last_sequence`, and `discarded_count`;
- ordered entries addressable from an exclusive or inclusive cursor;
- retention limits and overflow policy;
- enough payload or references to reconstruct the original event;
- an explicit discontinuity when restart, compaction, or data loss invalidates
  a previous cursor.

The journal is finite. If a requested cursor predates
`first_available_sequence`, the producer MUST report a gap rather than imply
complete replay.

This pattern is transport-independent. FractaLog and OpenTelemetry projections
may carry or derive the same cursors and causal identifiers. An MCP connector
may expose retrieval resources, tools, or subscription notifications, but MCP
transport notifications are not themselves the durable journal and MUST NOT be
treated as a delivery guarantee.

MCP tools may project SOMA actions, but an MCP tool name alone is not the
canonical action definition.

ReactiveSets may consume SOMA observations and notifications, but SOMA does
not require a particular reactive runtime.

### 10.1 Initial Operium action profile

The first node-agent profile defines three distinct operations:

| Semantic identity | Effect | Initial status |
|---|---|---|
| `observation.refresh` | Run an immediate observation cycle | Implemented |
| `agent.restart` | Replace the management-agent process incarnation | Implemented |
| `agent.upgrade` | Install and activate a newer agent runtime | Defined, not implemented |

`agent.restart` MUST NOT reboot the managed machine. A successful restart is
confirmed only when a new agent incarnation observes and completes the
persisted action.

An upgrade is broader than a repository pull. Depending on the node profile it
may change the agent source or immutable runtime artifact, dependencies,
semantic vocabulary, SQLite migrations, configuration, or supervisor wrapper.
An implementation SHOULD stage a known target, validate it, switch atomically,
restart the agent, verify the new incarnation, and retain a rollback target.

### 10.2 Homeostasis

Homeostasis is a policy layer over SOMA observations and actions, not a new
attribute behaviour type. A homeostatic controller tries to keep explicitly
named vital functions within declared viable ranges while preserving local
node autonomy.

A future policy SHOULD state:

- the observed variable and its viable, preferred, and critical ranges;
- sampling and persistence windows, including hysteresis;
- the permitted response: observe, recommend, request approval, act
  autonomously, or take an emergency action;
- action rate limits, cooldowns, rollback, and escalation;
- the evidence that proves recovery or terminates an unsuccessful loop.

This specification does not yet authorize autonomous remediation. The initial
implementation provides the observation and action primitives from which
carefully scoped homeostatic policies may later be composed.

## 11. Identity, containment, and references

SOMA identities SHOULD be stable, readable, and scoped. One candidate form is:

```text
node:rpi3-view
node:rpi3-view/interface:eth0
node:rpi3-view/service:operium-portal
```

The final identifier grammar remains open. Implementations MUST NOT infer
containment solely from string shape; containment is an explicit semantic
relation.

Collections SHOULD use stable semantic keys rather than array positions where
members have identity:

```json
{
  "interfaces": {
    "eth0": {
      "id": "node:rpi3-view/interface:eth0",
      "class": "network.interface"
    }
  }
}
```

Arrays remain appropriate for ordered values, samples, or values without
independent identity.

## 12. Projection model

One semantic object may have multiple projections:

```text
SOMA semantic definitions
          │
          ├── JSON/HTTP       machine interchange
          ├── HTML            human-readable localhost view
          ├── SQLite          local working memory and partial views
          ├── MCP             agent resources and actions
          ├── metrics         counters, gauges, rates, distributions
          ├── event feeds     notifications and change streams
          └── SNMP adapter    established network equipment
```

Projection data MAY be reconstructible. An implementation MUST document which
source defines class and attribute semantics and which stores are caches or
observations.

## 13. Operium integration

The first SOMA experiment SHOULD describe an Operium node and its local
services. Candidate endpoints are:

```text
/.well-known/operium-node   identity, capabilities, and projections
/status.json                current operational view
/metrics                    numeric telemetry projection
/events                     future notification feed
/                           human-readable node presentation
```

The descriptor and semantic vocabulary MAY be public when they contain no
private topology or operational observations. Detailed managed objects,
observations, actions, and notifications MUST follow the node's management
authorization policy.

The Operium Node Agent may become a producer of SOMA observations. Existing
ONA payloads remain current implementation facts until a deliberate mapping
and migration are specified.

The Views Store may persist private and public SOMA-derived views. Visibility
is a projection and policy concern; it MUST NOT silently change the underlying
meaning or provenance.

## 14. Relationship to Inox

SOMA's object model deliberately aligns with Inox where practical:

- object-oriented modelling with single inheritance;
- composition rather than multiple inheritance;
- potential use of ReactiveSets for sampled and event-driven observations;
- future implementation of SOMA definitions or operations in Inox.

This alignment is directional, not a claim that current Inox code implements
SOMA.

## 15. Non-goals

SOMA is not:

- a new mandatory wire protocol;
- a replacement for HTTP, MCP, SNMP, NETCONF, or event feeds;
- a centralized CMDB;
- a graph database requirement;
- an observability product;
- an orchestration engine;
- a mandate that every object expose every common attribute;
- an attempt to reproduce the full OSI management stack.

## 16. Initial conformance direction

A future minimal SOMA profile is expected to require:

1. stable object identity;
2. exactly one class identity;
3. schema or vocabulary version;
4. semantically defined attributes;
5. explicit distinction between configuration and observation;
6. observation provenance and time where values are sampled;
7. explicit containment and references;
8. declared capabilities for actions and notifications.

Formal JSON Schemas, vocabulary registries, and conformance levels are deferred
until the metamodel has been exercised on real Operium nodes.

## 17. Open questions

- What is the smallest mandatory object kernel?
- Are facets purely declarative packages, or may they define executable
  behaviour?
- How are semantic vocabulary versions and aliases governed?
- Which attributes belong in the first common vocabulary?
- What identity grammar balances readability, stability, and federation?
- How are desired and observed state represented without duplicating values?
- How should sampling policies negotiate local cost, freshness, and demand?
- How are notification replay and missed-event recovery expressed?
- Which authority model replaces MGCP's narrow controller assumption?
- How should public and private projections advertise redaction?

## 18. First implementation slice

The first experiment should remain deliberately small:

1. define `soma.ManagedObject`, `operium.Node`, and `operium.Service`;
2. define the `UserLabelled`, `Operational`, `HealthReporting`, and
   `SampledResourceUsage` facets;
3. define approximately ten common attributes;
4. publish a static JSON description for `rpi3-view`;
5. render the same object on the local `localhost` portal;
6. map counters and gauges to a metrics projection;
7. expose read-only SOMA resources through the existing MCP connector;
8. evaluate the model before adding write actions.

## 19. References

- RFC 3411, *An Architecture for Describing Simple Network Management
  Frameworks*: <https://www.rfc-editor.org/rfc/rfc3411>
- ITU-T X.710, *Common Management Information Service*:
  <https://www.itu.int/rec/T-REC-X.710/en>
- ITU-T X.722 / ISO/IEC 10165-4, *Guidelines for the Definition of Managed
  Objects*: <https://www.itu.int/ITU-T/formal-language/itu-t/x/x722/1992/x722.html>
- RFC 3261, *SIP: Session Initiation Protocol*:
  <https://www.rfc-editor.org/rfc/rfc3261>
- RFC 3435, *Media Gateway Control Protocol Version 1.0*:
  <https://www.rfc-editor.org/rfc/rfc3435>
