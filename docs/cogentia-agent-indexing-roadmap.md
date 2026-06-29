---
title: "Cogentia Agent Indexing Roadmap"
description: "Living agile plan for stable corpus indexes, branch overlays and agent-facing retrieval."
layout: default
nav_order: 6
date: 2026-06-29
last_modified_at: 2026-06-29
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/cogentia-agent-indexing-roadmap.md
document_role: "operational"
document_kind: "roadmap"
visibility: "public"
lifecycle_state: "active"
---
# Cogentia Agent Indexing Roadmap

This is a living operating plan, not a waterfall specification.

Cogentia is expected to serve several faces over the same governed corpus:

- local Codex and other engineering agents;
- private conversational agents;
- public visitors through read-only web, chat and MCP faces;
- operational tooling on the Fracta node.

The public face must stay stable and governed. The local agent face must also
understand work in progress without turning every transient edit into durable
memory.

## Working Model

```text
stable index
  main, origin/main, release tags or production refs
  durable, public-safe by default

branch work index
  committed branch state and branch-specific docs/code/config
  private by default, disposable, reusable after merge by content hash

workspace overlay
  dirty working tree facts
  local only, cheap first, temporary when semantic search is needed

tool-only material
  logs, secrets, large generated artifacts and binary data
  queried by specialized tools, not embedded by default

archive material
  legacy, history and backup files
  opt-in archaeology, not default semantic memory
```

Public Fracta defaults to the stable index. Local Codex defaults to stable plus
the current branch overlay, and may consult the workspace overlay when doing
active engineering work.

## Decisions

1. The daemon HTTP API remains the trust boundary for MCP and conversational
   clients.
2. Magistral remains the provider-neutral model and embedding router.
3. Embeddings are keyed by normalized content hash plus provider, model,
   dimensions and policy version.
4. Markdown body content is hashed separately from frontmatter so noisy metadata
   changes do not force re-embedding.
5. Logs are not semantic corpus content by default. They need log-query tools.
6. Archive material is opt-in archaeology, not active semantic memory.
7. Main is the stable corpus. Branch and workspace indexes are overlays, not
   pollution of the public index.

## Iteration Backlog

### 1. Measure Before Spending

Add a no-spend estimate command that reports:

- file counts by class;
- excluded and tool-only material;
- stable versus WIP channels;
- estimated tokens and chunks;
- raw vector storage for 512 and 1536 dimensions;
- estimated embedding spend for the selected model;
- existing cached embeddings by model and dimension.

Acceptance check:

```powershell
node scripts\cogentia.js index estimate --profile workspace --dimensions 512,1536 --json
```

### 2. Stable Index Policy

Extend the index schema and update path so stable/main content can be treated as
the durable corpus while metadata-only changes avoid semantic churn.

Acceptance checks:

- body hash changes trigger embedding refresh;
- frontmatter-only maintenance fields do not;
- public context search defaults to stable channel only.

### 3. Branch Work Index

Add a private per-branch overlay keyed by repo, branch, base commit, head commit
and policy.

Acceptance checks:

- local agent retrieval can query stable plus current branch;
- public Fracta still queries stable only;
- branch overlay can be discarded without damaging stable cache.

### 4. Promotion Path

When branch content reaches main, reuse cached embeddings by content hash and
promote the content into the stable channel.

Acceptance checks:

- merge-to-main does not duplicate embeddings for unchanged chunks;
- promotion is observable in Cogentia health/status output.

### 5. Agent Dogfood

Make Codex and conversational agents first-class clients of the governed corpus.

Acceptance checks:

- context packs cite repo, path, lines, channel and commit/ref;
- local Codex can tell whether a result came from stable, branch or workspace;
- public visitors cannot widen their view with query parameters.

## First Slice

The first slice is deliberately small: implement the no-spend estimator, then
use its numbers to decide where native 1536-dimensional stable embeddings are
worth producing and where smaller disposable overlays are enough.
