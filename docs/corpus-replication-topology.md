---
title: Corpus replication topology
author: unknown
date: '2026-07-17'
document_role: source
document_kind: operational-design
visibility: public
lifecycle_state: proposed
update_policy: UP-INFRASTRUCTURE-HEALTH
provenance:
  origin_type: repository
  origin_repository: JeanHuguesRobert/operium
  origin_ref: pending
  origin_date: '2026-07-17'
  derived_from: []
review:
  status: unreviewed
  reviewed_by: []
---

# Corpus replication topology

The local workstation remains the normal write/reconstruction environment. The
Fracta node is the first persistent Internet-visible replica and serves public
read-only views.

## Replicated products

- Markdown/document index and FTS cache;
- embedding rows and semantic acceleration caches;
- Corpus graph SQLite cache;
- GitHub issue index;
- Guide↔graph coherence snapshots and verification manifests.

## Replication invariants

Every transfer carries a manifest containing source commits, content hashes,
snapshot ID, graph/index hashes, generation time, and schema versions. A target
accepts a batch only after hash verification and atomic replacement. Repeating a
batch is a no-op; interrupted batches resume from the manifest.

Replication is directional by default (`local -> fracta`). Fracta never becomes
the canonical source and never writes back into the Corpus without an explicit
mandate and a separate promotion workflow.

## Health and visibility

Operium verifies freshness, schema compatibility, completeness, and public/private
boundaries. A stale or partial replica remains available only with an explicit
status; it must not present itself as current. Private embeddings, credentials,
and administrative graph data are excluded from the public facade.

## Recovery

All caches can be deleted and rebuilt from Git, registry configuration, source
frontmatter, continuation records, and authorized embedding providers. Fracta
replication is therefore an availability optimization, not a backup authority.
