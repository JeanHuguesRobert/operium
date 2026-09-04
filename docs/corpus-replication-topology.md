---
title: Corpus replication topology
author: Jean Hugues Noël Robert
date: '2026-07-17'
last_modified_at: '2026-09-04'
document_role: source
document_kind: operational-design
visibility: public
lifecycle_state: active
update_policy: UP-INFRASTRUCTURE-HEALTH
provenance:
  origin_type: repository
  origin_repository: JeanHuguesRobert/operium
  origin_date: '2026-07-17'
  derived_from: []
review:
  status: reviewed
  reviewed_by: ["Jean Hugues Robert"]
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "explicit-metadata"
classification_confidence: "high"
---

# Corpus replication topology

The local workstation (`i7-thinkpad-jhr`) remains the primary write and reconstruction
environment. Across Fractanet, the full multi-repository workspace is replicated
across cloud, edge, and mobile nodes with strict role separation.

## Node topology and workspace locations

| Node | Type | Path / Layout | Role & Services |
|---|---|---|---|
| **`i7-thinkpad-jhr`** | Workstation (Win 11) | `C:\tweesic\` | Primary write authority, local dev, full repo checkouts |
| **`fracta`** | Cloud VPS (OCI AMD) | `/srv/cogentia/repos/` | Canonical Internet-facing replica, Guide, MCP Attractor, public Git mirror |
| **`fracta2`** | Cloud VPS (OCI AMD) | `/srv/cogentia/repos/` | Secondary worker replica, KasmVNC hosted browser, ONA worker node |
| **`poco-jhr`** | Mobile (Termux Android) | `~/srv/cogentia/repos/` | Personal digital twin execution node (Agent John), synced via `fractanet-sync-repos-from-fracta.sh` |
| **`rpi3-view`** | Edge (RPi 3 Model B) | `/srv/cogentia/repos/` | Edge observation & portal node (18 GB free storage), ONA node, synced via `~/sync-repos.sh` |

## Workspace root guidance (`AGENTS.md`)

To avoid configuration drift, unversioned local mandate capture, and ensure identical
operational orientation across all coding agents regardless of the host node:

1. **Root Pointer:** Every node hosts an ultra-minimal `AGENTS.md` at its workspace root (`C:\tweesic\AGENTS.md` or `/srv/cogentia/repos/AGENTS.md`).
2. **Canonical Redirection:** This pointer does not store local doctrine; it immediately redirects agents to the Git-versioned workspace guidance:
   - Local: `cogentia/instructions/AGENTS.workspace.md`
   - Canonical GitHub URL: `https://github.com/JeanHuguesRobert/cogentia/blob/main/instructions/AGENTS.workspace.md`
   - Corpus Shared Mandate: `cogentia/instructions/AGENTS.shared.md`

## Replicated products

- Git repositories (23 sovereign repositories composing the Cogentia corpus);
- Markdown/document index and FTS cache;
- Embedding rows and semantic acceleration caches;
- Corpus graph SQLite cache;
- GitHub issue index;
- Guide↔graph coherence snapshots and verification manifests.

## Replication invariants

Every transfer carries a manifest containing source commits, content hashes,
snapshot ID, graph/index hashes, generation time, and schema versions. A target
accepts a batch only after hash verification and atomic replacement. Repeating a
batch is a no-op; interrupted batches resume from the manifest.

Replication is directional by default (`local -> fracta -> workers/edge`). Fracta never becomes
the canonical source and never writes back into the Corpus without an explicit
mandate and a separate promotion workflow.

When replicating across working checkouts (such as `fracta2`), synchronization tools MUST
respect the Measured Risk invariant and avoid destructive flags (`--delete`) on active repos
with local uncommitted WIP (`--ignore-existing` preserves local work).

## Health and visibility

Operium verifies freshness, schema compatibility, completeness, and public/private
boundaries. A stale or partial replica remains available only with an explicit
status; it must not present itself as current. Private embeddings, credentials,
and administrative graph data are excluded from the public facade.

## Recovery

All caches can be deleted and rebuilt from Git, registry configuration, source
frontmatter, continuation records, and authorized embedding providers. Node
replication is an availability and autonomy optimization, not a backup authority.
