---
title: Operium Corpus graph service
author: unknown
date: '2026-07-17'
document_role: source
document_kind: service-design
visibility: public
lifecycle_state: proposed
update_policy: UP-INFRASTRUCTURE-HEALTH
provenance:
  origin_type: repository
  origin_repository: JeanHuguesRobert/operium
  origin_ref: pending
  origin_date: '2026-07-17'
  derived_from:
    - JeanHuguesRobert/cogentia/docs/corpus-graph-contract.md
review:
  status: unreviewed
  reviewed_by: []
---

# Operium Corpus graph service

Operium provides the concrete, read-only service for the dynamic Living Corpus
graph specified by Cogentia. It reconstructs a view from tracked repositories,
frontmatter, Git history, registry data, and continuation reports.

## Initial interface

The first implementation may expose equivalent CLI or HTTP operations:

```text
GET /graph/node/:id
GET /graph/ancestors/:id?depth=n
GET /graph/descendants/:id?depth=n
GET /graph/path?from=id&to=id&max_depth=n
GET /graph/continuations
GET /graph/snapshot
```

Responses include `schema`, `generated_at`, `registry_revision`, source commits,
visibility mandate, and `read_only: true`.

## Reconstruction and failure modes

- the graph index is disposable and rebuildable;
- cycles are returned as graph structure, never treated as fatal;
- missing references are returned as `unresolved` or `broken` edges;
- stale source commits invalidate a snapshot rather than silently updating it;
- a blocked repository is visible in the snapshot with its reason.

## Operational boundary

Operium enforces infrastructure health, credentials, network exposure, and
visibility mandates. The public facade is read-only. No route rewrites source
files, resolves a continuation, publishes externally, or grants authority to an
agent. Proposed propagation work is emitted as a trace/continuation for a
mandated actor.

## Verification

Before exposure, verify reconstruction from a clean checkout, deterministic
snapshot hashes for the same source state, cycle handling, broken-edge reporting,
and public/private route separation. Store the verification result with the
snapshot metadata.
