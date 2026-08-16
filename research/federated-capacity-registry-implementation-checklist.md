---
title: "Federated Capacity Registry — implementation checklist"
author: "Jean Hugues Noël Robert"
date: "2026-08-16"
status: "operational checklist"
document_role: "operational"
document_kind: "implementation-checklist"
visibility: "public"
lifecycle_state: "active"
related_documents:
  - "research/federated-capacity-registry.md"
  - "docs/operium-node-agent.md"
---

# Federated Capacity Registry — implementation checklist

## Phase 0 — inventory before schema changes

- [ ] Inspect current Operium catalogue resource fields.
- [ ] Inspect ONA `operium.node.v1` advertisement fields.
- [ ] Inspect existing packet-attractor capability fields consumed by COP/Fractanet.
- [ ] Inspect current cost/health/availability fields already present in Operium projections.
- [ ] Record overlaps and gaps before introducing new vocabulary.

## Phase 1 — read-only capacity projection

- [ ] Define the smallest backward-compatible qualified-capacity declaration.
- [ ] Preserve source identity, freshness and evidence.
- [ ] Distinguish measured, estimated and unknown values.
- [ ] Distinguish local/API/CLI/MCP/web/subscription access modes.
- [ ] Distinguish automatable capacity from UI-only entitlement.
- [ ] Do not expose credentials or secret entitlement data.

## Phase 2 — JHR lean-mode dogfood

Inventory, where legitimately measurable:

- [ ] local machines;
- [ ] `fracta` VPS;
- [ ] Oracle Free Tier;
- [ ] API quotas/credits;
- [ ] subscription-mediated cognitive capacity;
- [ ] storage/network capacity;
- [ ] other free/prepaid tiers.

For every entry, record uncertainty instead of inventing quotas.

## Phase 3 — packet requirements bridge

- [ ] Define a provider-neutral packet requirements shape.
- [ ] Query Operium for candidate capacities.
- [ ] Keep `capable != authorized` explicit.
- [ ] Preserve mandate/budget checks outside pure matching.
- [ ] Return several candidates when useful instead of hiding routing alternatives.

## Phase 4 — accounting feedback

- [ ] Record actual consumption on the owning Cognitive Packet.
- [ ] Project provider/model/capability/resource usage analytically.
- [ ] Reconcile estimated vs invoiced monetary cost when stronger evidence arrives.
- [ ] Prevent duplicate source accounting between Operium and COP.

## Phase 5 — background capacity

- [ ] Expose qualified residual/preemptible capacity.
- [ ] Allow Sleep/background work only with explicit mandate and bounded budget.
- [ ] Make foreground demand preempt background work where declared.
- [ ] Emit capacity-change signals usable by bounded reevaluators of blocked work.

## Regression / acceptance checks

- [ ] Removing one provider UI does not destroy the capacity inventory semantics.
- [ ] A stale capacity advertisement is never presented as currently verified.
- [ ] An already-paid/free capacity can be preferred without assuming its human-attention cost is zero.
- [ ] Reserved idle capacity is not misclassified as waste.
- [ ] A subscription entitlement is never silently treated as API automation.
- [ ] Operium reports capacity; it does not infer cognitive mandate or intellectual priority.
