---
title: "Cogentia Semantic Stack"
description: "Operational profile for running Cogentia retrieval with Magistral embeddings locally and on the Fracta public node."
layout: default
nav_order: 5
date: 2026-06-29
last_modified_at: 2026-06-29
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/cogentia-semantic-stack.md
document_role: "operational"
document_kind: "method"
visibility: "public"
lifecycle_state: "active"
---
# Cogentia Semantic Stack

This note defines the public operational method for running Cogentia with
semantic retrieval.

It separates:

- local developer profile;
- Fracta public-node profile;
- private operational registry data.

Secrets, private IP addresses, complete host topology and credential values do
not belong in this public note.

## Components

```text
Cogentia corpus index
  -> stored chunk embeddings
  -> Cogentia daemon context routes
  -> Magistral AI router /v1/embeddings
  -> semantic or hybrid retrieval
  -> MCP and conversational faces
```

Cogentia owns the corpus, citations and public/private view boundary.
Magistral owns model and embedding provider routing.
Operium records the operational profile and health method.

## Local Profile

Local default ports:

```text
Magistral: http://127.0.0.1:8880
Cogentia daemon: http://127.0.0.1:8790 when started for tests
```

The local Magistral embedding profile should be configured in the private
`inseme/.env` file:

```text
MAGISTRAL_EMBEDDINGS_ENABLED=true
MAGISTRAL_EMBEDDING_PROVIDER=openai
MAGISTRAL_EMBEDDING_MODEL=text-embedding-3-small
MAGISTRAL_EMBEDDING_DIMENSIONS=1024
MAGISTRAL_EMBEDDING_POLICY=cogentia-openai-text-embedding-3-small-1024-v1
MAGISTRAL_EMBEDDING_TIMEOUT_MS=20000
```

This profile matches the current public Cogentia corpus embedding target:

```text
provider: openai
model: text-embedding-3-small
dimensions: 1024
```

## Local Smoke Test

Use the broad corpus registry:

```powershell
$env:COGENTIA_REGISTRY='C:\tweesic\JeanHuguesRobert\.cogentia.json'
```

Check the non-spending service health:

```powershell
Invoke-RestMethod http://127.0.0.1:8880/health
node C:\tweesic\cogentia\scripts\cogentia.js agent health --json
```

Run the explicit one-query embedding check:

```powershell
node C:\tweesic\cogentia\scripts\cogentia.js agent health --check-query --json
```

The expected successful state is:

```text
index_available: true
semantic_available: true
ai_router.capabilities.embeddings: true
query_embedding.ok: true
actual_dimensions: 1024
```

Then verify that hybrid retrieval is semantic, not keyword fallback:

```powershell
node C:\tweesic\cogentia\scripts\cogentia.js daemon --host 127.0.0.1 --port 8790
Invoke-RestMethod 'http://127.0.0.1:8790/api/context/search?q=What%20is%20Cogentia%3F&mode=hybrid&repo=cogentia&limit=3'
```

The result should include:

```text
_reasons: semantic_similarity
Semantic retrieval used openai/text-embedding-3-small (1024d).
```

## Fracta Public Profile

Fracta is the small public VPS profile for exposing a governed Cogentia face.

Observed public shape on 2026-06-29:

- SSH alias used locally: `fracta`;
- `fraca` was not a resolvable local SSH alias at observation time;
- public domain role: `cogentia.fractavolta.com`;
- Cogentia daemon runs on loopback, not directly on the public interface;
- an MCP HTTP adapter is present behind the reverse proxy;
- the Fracta repository mirror includes `JeanHuguesRobert`, `cogentia`,
  `inseme`, `operium` and the related public corpus repositories;
- the remote context index was manually rebuilt on 2026-06-29 and plain
  context retrieval is available;
- remote semantic retrieval is not ready until stored embeddings and a local
  Magistral embedding endpoint are available on the node.

This is an operational observation, not a guarantee of future state.

## Fracta Intended Boundary

The Fracta public node should expose:

- public read-only context retrieval;
- remote MCP over HTTP/SSE;
- conversational corpus API;
- a browser UI for public corpus queries.

It should not expose:

- full/private corpus view;
- index rebuild or filesystem operations;
- provider keys or model-router administration;
- private registry data;
- raw operational incident details.

Magistral should remain loopback-only. Cogentia should be the public boundary.

## Fracta Readiness Checks

Run these checks through SSH from a trusted workstation:

```bash
ssh fracta 'hostname; whoami; uname -a'
ssh fracta 'systemctl --no-pager --plain list-units "*cogentia*" "*mcp*" "*magistral*"'
ssh fracta 'curl -fsS http://127.0.0.1:8790/api/context/health'
ssh fracta 'curl -fsS http://127.0.0.1:8790/api/agent/health'
```

The remote semantic stack is ready only when:

```text
context.index_available: true
context.semantic_available: true
agent.ai_router.available: true
agent.ai_router.capabilities.embeddings: true
```

If the remote corpus index is absent, rebuild or restore the index before
enabling public context retrieval. If stored embeddings are absent, populate or
restore them before enabling semantic retrieval. If the AI router is absent,
start or configure Magistral before enabling conversational or semantic
endpoints.

## Next Implementation Slice

The next useful implementation slice is remote MCP consolidation:

1. keep `scripts/cogentia-mcp.js` as the stdio adapter;
2. add or align a remote HTTP/SSE MCP face with the same daemon context routes;
3. keep public mode as the default view;
4. verify that remote MCP search uses the same semantic retrieval target as the
   conversational API;
5. document public endpoints in the reverse proxy without exposing admin paths.
