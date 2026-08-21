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
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "explicit-metadata"
classification_confidence: "medium"
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
MAGISTRAL_EMBEDDING_DIMENSIONS=1536
MAGISTRAL_EMBEDDING_POLICY=cogentia-openai-text-embedding-3-small-1536-v1
MAGISTRAL_EMBEDDING_TIMEOUT_MS=20000
```

This profile matches the current public Cogentia corpus embedding target:

```text
provider: openai
model: text-embedding-3-small
dimensions: 1536
```

Earlier 1024-dimensional OpenAI embeddings were an experiment. New stable
corpus embeddings should use the model-native 1536-dimensional profile unless a
temporary branch/workspace overlay explicitly chooses a smaller disposable
profile.

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
actual_dimensions: 1536
```

Then verify that hybrid retrieval is semantic, not keyword fallback:

```powershell
node C:\tweesic\cogentia\scripts\cogentia.js daemon --host 127.0.0.1 --port 8790
Invoke-RestMethod 'http://127.0.0.1:8790/api/context/search?q=What%20is%20Cogentia%3F&mode=hybrid&repo=cogentia&limit=3'
```

The result should include:

```text
_reasons: semantic_similarity
Semantic retrieval used openai/text-embedding-3-small (1536d).
```

## Fracta Public Profile

Fracta is the small public VPS profile for exposing a governed Cogentia face.

Observed public shape on 2026-06-29:

- SSH alias used locally: `fracta`;
- `fraca` was not a resolvable local SSH alias at observation time;
- public domain role: `cogentia.fractavolta.com`;
- public port 80 is handled by `caddy.service`;
- Caddy routes `cogentia.fractavolta.com` to the local MCP HTTP adapter;
- Caddy does not publicly proxy the Magistral/model-router backend;
- Cogentia daemon runs on loopback, not directly on the public interface;
- an MCP HTTP adapter is present behind Caddy;
- the earlier Gabby subdomain router was an intermediate local replacement and
  has been retired;
- Nginx is disabled and inactive;
- Caddy is the intended well-known lightweight open-source alternative to Nginx
  for this node;
- the Fracta repository mirror includes `JeanHuguesRobert`, `cogentia`,
  `inseme`, `operium` and the related public corpus repositories;
- the remote context index was manually rebuilt on 2026-06-29 and plain
  context retrieval is available;
- regional Supabase retrieval (`COGENTIA_RETRIEVAL_BACKEND=supabase`) was enabled
  on the Guide MCP in 2026-07 (Phase 1); see `cogentia/docs/retrieval-roadmap.md`;
- Phase 4 target: `COGENTIA_INOX_RETRIEVAL_URL` on a capable host so fracta drops
  Supabase/OpenAI keys from `guide.env` — see [Fracta trust perimeter](fracta-trust-perimeter.md).

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

## Chatbot Channel Ingress Architecture (WhatsApp / Multi-Channel)

Operational doctrine for multi-channel chatbot ingress (WhatsApp, Telegram, Mail):

1. **Headless Cloud Ingress on `fracta`**:
   - Channel adapters operate as **headless HTTP webhooks** hosted directly on `fracta` (24/7 cloud node).
   - Ingress webhooks receive incoming messages directly from cloud providers (e.g. WhatsApp Cloud API, Telegram Bot API).
   - The chatbot engine runs continuously on `fracta` regardless of whether the operator's PC or personal mobile handset is online.

2. **Decoupled Channel Core**:
   - **Thread History (`conversation-store.js`)**: Sliding-window thread persistence per correspondent under `conversations/<id>.json`.
   - **History-Aware Disclosure (`disclosure.js`)**: Suppresses verbose disclaimers on active threads after recent delivery.
   - **Direct Contact Routing**: Explicitly directs users to `jeanhuguesrobert@gmail.com` for human decisions or direct contact.
   - **Technical Debt Note (Multi-Instance Contact Reconciliation)**: At the current single-principal MVP stage, `contact_email` is loaded directly from the operational Vault/local environment (`contact_email` in `config.js` / `instance_config`). When scaling to multi-tenant / multi-principal instances, `contact_email` resolution will be reconciled with the principal's public identity as exposed on their primary GitHub account (`principal_repo`).

3. **Retirement of Phone-Dependent Baileys / Termux Prototype**:
   - Local Baileys pairing and Termux phone-dependent daemons are retired as temporary initial MVP placements.
   - Mobile handsets are treated as transient clients/placements, not memory stores or primary server hosts.

## Fracta Readiness Checks

Run these checks through SSH from a trusted workstation:

```bash
ssh fracta 'hostname; whoami; uname -a'
ssh fracta 'systemctl --no-pager --plain list-units "*cogentia*" "*mcp*" "*magistral*"'
ssh fracta 'curl -fsS http://127.0.0.1:8790/api/context/health'
ssh fracta 'curl -fsS http://127.0.0.1:8790/api/agent/health'
ssh fracta 'curl -fsS http://127.0.0.1:8791/cop/health'
```

The remote semantic stack and mutualized attractor are ready only when:

```text
context.index_available: true
context.semantic_available: true
agent.ai_router.available: true
agent.ai_router.capabilities.embeddings: true
cop_attractor.status: online
```

If the remote corpus index is absent, rebuild or restore the index before
enabling public context retrieval. If stored embeddings are absent, populate or
restore them before enabling semantic retrieval. If the AI router is absent,
start or configure Magistral before enabling conversational or semantic
endpoints.

## Next Implementation Slice

The next useful implementation slice is estimate-first indexing:

1. measure the broad executable corpus before spending embedding quota;
2. separate stable `main` material from branch and workspace overlays;
3. classify logs, secrets, generated artifacts and oversized files as non-
   semantic by default;
4. estimate tokens, chunks, vector storage and model spend for 512 and 1536
   dimensions;
5. use those numbers to decide which semantic layer should be promoted beyond
   Markdown.

The living plan is [Cogentia Agent Indexing Roadmap](cogentia-agent-indexing-roadmap.md).
