---
title: "Operium Federated Capacity Registry"
subtitle: "Local authority, federated projections, qualified capacity and analytical imputation"
author: "Jean Hugues Noël Robert"
repository: "operium"
status: "working source — architecture direction"
version: "0.1"
date: "2026-08-16"
last_modified_at: "2026-08-16"
language: "en"
document_role: "source"
document_kind: "architecture"
visibility: "public"
lifecycle_state: "working"
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "explicit-metadata"
classification_confidence: "medium"
related_documents:
  - "docs/operium-node-agent.md"
  - "https://github.com/JeanHuguesRobert/inseme/blob/main/research/cogentia_accounting_architecture.md"
  - "https://github.com/JeanHuguesRobert/inseme/blob/main/packages/cop-kernel/docs/packet-strict-accounting-cascade.md"
  - "https://github.com/JeanHuguesRobert/cogentia/blob/main/research/propagation_register.md"
---

# Operium Federated Capacity Registry

## 1. Decision boundary

Operium is the natural owner of the **operational registry of available capacities**.

Cogentia and COP may define or carry capacity requirements, mandates, budgets, packet-local consumption facts and analytical projections, but they SHOULD NOT become a second operational authority for capacity inventory.

Compact rule:

> **Cogentia expresses what a governed packet needs. Operium describes what the federation can currently provide.**

This preserves separation of concerns:

```text
Cogentia / COP
  mission + mandate + requirements + budget
             ↓
Operium
  capacity inventory + health + availability + placement candidates
             ↓
handler / node / provider
  execution
             ↓
packet-local trace + consumption
             ↓
Cogentia analytical accounting / projections
```

## 2. Why this belongs in Operium

The current Operium architecture already distinguishes:

```text
slow catalogue   = declared durable resource truth
fast blackboard  = volatile capacity/presence advertisements
node-local cache = hot operational projection
```

The federated capacity registry extends this existing structure rather than creating a parallel registry in Cogentia.

It must remain federated:

```text
local declaration / observation
        ↓
local authority
        ↓
federated advertisement / projection
        ↓
qualified global view
```

No central view becomes more authoritative than the sources from which it is projected.

## 3. Capacity is broader than hardware

A capacity may be physical, virtual, contractual, subscription-based, quota-based, human, or service-mediated.

Initial examples include:

- CPU/GPU/RAM/storage/network on owned machines;
- VPS and cloud instances;
- free-tier compute or storage;
- API quotas and prepaid credits;
- subscription-mediated cognitive capacity when the access mode permits useful governed work;
- inference endpoints;
- MCP/tool capabilities;
- human operator or reviewer availability where explicitly represented;
- reserved or guaranteed capacity;
- opportunistic residual capacity.

A subscription UI entitlement MUST NOT be silently treated as equivalent to an automatable API capability.

## 4. Qualified capacity declaration

A minimal generic declaration should be able to express:

```yaml
capacity:
  capacity_id:
  owner_or_source_ref:
  provider:
  kind: compute|inference|storage|network|tool|human|other
  capability_refs: []
  access_mode: local|ssh|api|cli|mcp|web|subscription|other
  location:
  jurisdiction:
  availability:
    state: available|degraded|reserved|offline|unknown
    observed_at:
    valid_until:
  quantity:
    value:
    unit:
    confidence:
  quota:
    limit:
    remaining:
    reset_at:
    measurement_status: measured|estimated|unknown
  economics:
    fixed_cost:
    marginal_cost:
    currency:
    prepaid: false
    free_tier: false
  execution:
    automatable: true|false|partial|unknown
    interruptible: true|false|unknown
    preemptible: true|false|unknown
    latency_class:
  security:
    privacy_class:
    isolation:
  provenance:
    source_ref:
    evidence_refs: []
```

This is a working shape, not yet a frozen schema.

## 5. Federation model

Each node/provider/source remains authoritative for the facts it can legitimately declare or measure.

The global registry is a projection:

```text
GlobalCapacityView
  = federation(LocalCapacityViews)
```

Every projected entry SHOULD retain at least:

- source identity;
- freshness;
- provenance/evidence;
- confidence or measurement status;
- visibility/disclosure class;
- current operational state;
- applicable mandate or access constraints where relevant.

Stale or uncertain capacity MUST remain distinguishable from currently verified capacity.

## 6. Relationship to Cognitive Packets

A Cognitive Packet SHOULD express requirements rather than select a provider by hidden convention.

Conceptually:

```yaml
packet_requirements:
  capability:
  minimum_quality:
  deadline:
  locality:
  jurisdiction:
  privacy_class:
  interruptible:
  maximum_budget:
  preferred_cost_class:
```

Operium resolves candidate capacities. Authorization remains external to mere capability matching:

```text
capable ≠ authorized
```

The selected execution records its actual resource use on the packet or packet lineage. Consolidated accounting remains a projection, not duplicated source spending.

## 7. Lean-mode routing

For a resource-constrained principal, the scheduler SHOULD be able to prefer already-paid, prepaid, free-tier or otherwise low-marginal-cost admissible capacity before purchasing new capacity, provided that total cost remains favorable.

Total cost is not only monetary:

```text
TotalCost
= money
+ human attention
+ latency
+ operational risk
+ switching friction
+ opportunity cost
```

Therefore maximizing utilization is not an objective by itself.

## 8. Background work and residual capacity

Background work such as indexing, consolidation, replay, cognitive-regression tests, research or Corpus Sleep Cycle operations may consume qualified residual capacity when:

- foreground work does not require it;
- a clear mandate exists;
- a bounded budget exists;
- the work is preemptible where appropriate;
- progress can be checkpointed;
- the capacity's access terms permit the intended use.

This creates a useful coupling:

```text
Operium capacity change
→ previously blocked background packet may become admissible
→ Cogentia/COP reevaluator may reconsider it
```

Operium reports capacity. It does not decide that a cognitive propagation or research branch is intellectually worthwhile.

## 9. Accounting symmetry

The architecture intentionally mirrors packet-local accounting:

```text
capacity source facts stay local
→ federated capacity projections

consumption source facts stay packet-local
→ consolidated analytical projections
```

This gives a common pattern:

> **Put source facts where the act or resource state occurs; federate and consolidate by projection.**

## 10. First dogfood case

The first practical inventory SHOULD be the heterogeneous compute/cognitive capacity already available to Jean Hugues Robert, including where measurable and legally/contractually usable:

- local machines;
- the `fracta` VPS;
- Oracle Free Tier resources;
- AI/API subscriptions and credits;
- other free tiers;
- storage/network resources;
- later Fractanet nodes.

The purpose is not to publish private credentials or entitlement details. The purpose is to make the usable capacity measurable enough to route work economically in lean mode.

## 11. Implementation path

Proceed incrementally:

```text
1. inventory existing Operium catalogue fields and ONA advertisements
2. define a minimal capacity declaration extension
3. add read-only inventory/projection
4. dogfood on JHR capacities
5. measure actual usage where possible
6. connect packet requirements to candidate lookup
7. connect packet-local accounting to observed consumption
8. only then add automatic placement/routing decisions
```

Avoid a new centralized database when existing Git catalogue + blackboard + node-local projections can support the first implementation.

## 12. Verification questions

The architecture should eventually answer reproducibly:

1. What usable capacity exists now?
2. Which source says so, and how fresh is the evidence?
3. Which capacity is already paid/free/prepaid?
4. Which work is admissible on it?
5. What is the expected and actual cost?
6. What capacity is reserved and therefore intentionally idle?
7. Which background work could safely consume residual capacity?
8. What changed since the previous inventory?
9. Can the same view be reconstructed without one provider UI?

## 13. Non-goals

- no secret values in the public registry;
- no assumption that every subscription is automatable;
- no hidden authorization inferred from capability presence;
- no requirement for one central scheduler;
- no duplication of authoritative packet spending into Operium;
- no forced 100% utilization;
- no purchase recommendation before existing qualified capacity is measured.
