---
title: "Incident note — fracta daemon health latency (July 2026)"
description: "Root cause of /guide/health 500, operium up false negatives, and MCP timeout on 1 GB VPS."
layout: default
date: 2026-07-04
last_modified_at: 2026-07-04
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/research/fracta-daemon-health-2026-07.md
document_role: "operational"
document_kind: "incident"
visibility: "public"
lifecycle_state: "active"
status: "mitigated — quick health probe deployed"
---

# Incident note — fracta daemon health latency (July 2026)

## Symptoms

| Symptom | Where |
|---------|-------|
| `operium up` reports `aggregator_unreachable` or broken critical path | ThinkPad CLI |
| `/guide/health` HTTP **500** (~15 s) | fracta MCP :8791 |
| `/health` timeout (~10 s) | fracta MCP |
| `layers.retrieval.backend` null in early probes | `/ops/status` when `guideHealth` failed |
| `mcp_ok: false` but `guide_ok: true` | `/ops/status` (duplicate daemon probes) |

Public HTTPS to `/ops/status` was **intermittent** (client timeout) while loopback on fracta could still be slow.

## Root cause

**Observed facts** on fracta (~1 GB RAM, ~600 MB swap in use):

1. **`/api/status`** (daemon liveness) is instant — used by `fracta-guide-stack.sh healthcheck`.
2. **`/api/context/health`** (full context gateway health) runs `indexStatus()` + `preferredContextEmbeddingTarget()` under SQLite lock.
3. **Cold path** after idle: **7–8 s** for first probe; **~90 ms** once caches warm (`INDEX_STATUS_CACHE_MS` 30 s, `EMBEDDING_TARGET_CACHE_MS` 5 min).
4. MCP adapter calls full health via `cogentia_health` with default **`COGENTIA_MCP_TIMEOUT_MS=15000`** — fails at exactly 15.001 s under load.
5. **`buildFractanetOpsStatus`** called `health()` then `guideHealth()` — **two** sequential daemon probes; first could timeout, second succeed → inconsistent `mcp_ok` / `guide_ok`.

The stack supervisor looked healthy because it probed `/api/status`, not `/api/context/health`.

## Mitigations (2026-07-04)

| Change | Repo |
|--------|------|
| `cogentia_health` uses `/api/context/health?quick=1` (liveness without index/embedding work) | cogentia |
| `buildFractanetOpsStatus` single `guideHealth` probe | cogentia |
| `operium up` default timeout **25 s** | operium |

## Operator checks

```bash
# Fast liveness (should be <1s)
ssh fracta 'curl -fsS "http://127.0.0.1:8790/api/context/health?quick=1" | jq .quick,.ok'

# Full context health (may be slow on cold VPS)
ssh fracta 'curl -fsS -m 30 http://127.0.0.1:8790/api/context/health | jq .index_available,.semantic_available'

# End-to-end
operium up --human
curl -fsS https://cogentia.fractavolta.com/ops/status | jq .summary,.layers.retrieval
```

## Intended follow-ups

- Optional `COGENTIA_MCP_TIMEOUT_MS=30000` in fracta `guide.env` for full (non-quick) health when needed.
- Phase 4: keep heavy retrieval on capable host; fracta daemon stays weak — align health probes with that model.
- `fracta-guide-stack.sh`: optional second probe on full context health with longer timeout (document fragility, do not false-green).

## Changelog

| Date | Change |
|------|--------|
| 2026-07-04 | Investigation + quick health probe + operium timeout bump |