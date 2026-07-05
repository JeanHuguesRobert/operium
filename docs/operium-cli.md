---
title: "Operium CLI"
description: "operium up — Fractanet observer for humans and agents; operium.up.v1 JSON schema."
layout: default
date: 2026-07-04
last_modified_at: 2026-07-04
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/operium-cli.md
document_role: "operational"
document_kind: "method"
visibility: "public"
lifecycle_state: "active"
---

# Operium CLI

The **Operium CLI** is the portable observer for the rising Fractanet infrastructure. It answers: *what is up, what is drifted, what should happen next*.

Companion surfaces:

| Surface | Role |
|---------|------|
| `operium up` | Observer on any trusted workstation |
| `operium handoff wip` / `operium resume wip` | GitHub-backed WIP handoff between trusted nodes |
| `GET /ops/status` | Runtime aggregator on fracta (same schema subset) |
| `/ops/dashboard` | Human web UI |

---

## Install

```bash
cd operium
npm install
npm link   # optional: global operium command
```

Or run directly:

```bash
node operium/bin/operium.js up --json
```

---

## Command: `operium up`

```bash
operium up [--json|--human] [--probe|--no-probe] [--registry PATH] [--aggregator URL] [--section NAME] [--timeout MS] [--quiet]
```

### Examples

```bash
# Agent default — full operium.up.v1 JSON on stdout
operium up --json

# Human summary
operium up --human

# Catalogue only (no network probes)
operium up --no-probe --json

# Single layer
operium up --json --section blackboard

# Override aggregator
operium up --aggregator https://cogentia.fractavolta.com --json
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Critical path OK, health score > 2 |
| `1` | Degraded but usable |
| `2` | Broken critical path |
| `3` | Incomplete (probes skipped or unknown section) |

### Environment

| Variable | Default |
|----------|---------|
| `OPERIUM_REGISTRY` | `~/.cogentia/registry/resources.yaml` (canonical copy: `registre-mariani/operium/registry/resources.yaml` in private git) |
| `OPERIUM_AGGREGATOR_URL` | `https://cogentia.fractavolta.com` |

---

## Schema: `operium.up.v1`

Top-level fields:

| Field | Role |
|-------|------|
| `schema` | Always `operium.up.v1` |
| `role` | `observer` (CLI) or `runtime-aggregator` (fracta `/ops/status`) |
| `summary` | `health_score` (0–5), `status`, `critical_path_ok`, `headline` |
| `layers.catalogue` | Private registry nodes + planned nodes |
| `layers.mesh` | Tailscale peers (local probe) |
| `layers.services` | Remote fracta services + local inox-serve |
| `layers.blackboard` | Packet attractor snapshot |
| `layers.retrieval` | Effective retrieval backend, inox URL, `phase2_wired` |
| `layers.public_face` | Aggregator reachability |
| `drift[]` | Catalogue vs live, intended vs current |
| `open_decisions[]` | Documented unresolved choices |
| `next_actions[]` | Actionable follow-ups |

**No secret values** appear in output — only refs and file-exists checks.

---

## Data flow

```text
OPERIUM_REGISTRY → resources.yaml (private catalogue; versioned in registre-mariani)
        +
tailscale status --json (local)
        +
GET {aggregator}/ops/status
        +
local inox-serve /health (if capable host)
        =
operium up --json
```

`/ops/status` on fracta emits the same `layers.*` shape for services, blackboard, retrieval, and public_face. The CLI adds catalogue, mesh, drift, and next_actions.

---

## Tests

```bash
cd operium
npm run test:up
npm run test:wip
```

---

## WIP handoff/resume

For resumable interrupted work, see [Operium WIP handoff](operium-wip.md).

```bash
operium wip status --topic fractanet-android-node
operium handoff wip --topic fractanet-android-node
operium resume wip --topic fractanet-android-node
```

These commands use WIP commits on `wip/<topic>` branches instead of `git stash`, because WIP branches
can be fetched from another trusted node.

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-05 | Added `operium handoff wip`, `operium resume wip`, and `operium wip status` |
| 2026-07-04 | Phase 1: `operium up`, operium.up.v1, fracta `/ops/status` alignment |
