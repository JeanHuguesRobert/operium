---
title: "FractaNet Observed-State Reconciliation"
description: "Read-only SSH observation and controlled reconciliation between declared node configuration and live FractaNet state."
author: "Jean Hugues Noël Robert, with Codex"
created_at: 2026-07-17
last_modified_at: 2026-07-17
document_role: source
update_policy: human-guided
visibility: internal
trace_level: detailed
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/master/research/fractanet-observed-state-reconciliation.md
---

# FractaNet Observed-State Reconciliation

## Intent

Operium should keep a durable distinction between:

- declared node configuration and policy;
- live state observed from the node;
- divergence reports;
- authorized reconciliation actions.

The first implementation is read-only. It must be restartable, idempotent,
incremental and fully traceable.

## Initial loop

```text
declared configuration
  -> targeted SSH observation
  -> normalized observation record
  -> divergence report
  -> mandate or continuation when judgment is required
  -> controlled synchronization
  -> fresh observation
```

Observations must not silently mutate the node. Every observation records the
node identity, command family, timestamp, collector version, redaction policy,
and evidence digest.

## Declared node records

Each FractaNet node should have a declarative record covering at least:

- stable node identifier and operator handle;
- expected services and enablement policy;
- expected listening surfaces and trust boundary;
- repository paths and deployment revisions;
- resource profile and acceptable pressure thresholds;
- backup and recovery locations;
- allowed observation and synchronization capabilities.

Secrets and secret values are never part of the declared public record.

## Targeted observation

The collector should begin with cheap, high-signal probes:

- SSH reachability and identity;
- Git revision and dirty-worktree summary;
- systemd unit state and main process;
- listening ports and route health;
- memory, swap, load, I/O wait and CPU steal;
- selected logs and error counters;
- backup and cache presence.

It should expand observation only when a signal crosses a threshold or a
declared invariant is violated.

## Trap-directed polling

Polling should be directed by traps rather than uniformly scheduled. Examples:

- a service changes state;
- a route becomes slow or unavailable;
- a worktree diverges from its declared revision;
- resource pressure crosses a threshold;
- a previous observation produced an unresolved continuation.

The scheduler must bound concurrency, preserve checkpoints, and record why a
probe was selected. Randomized reevaluation may later revisit unresolved
branches under explicit compute and frequency budgets.

## Reconciliation boundary

Automatic reconciliation is limited to low-risk, reversible actions. Service
stops, resets, secret changes, data movement and production deployments require
an explicit mandate. When a deterministic collector cannot decide whether a
local change is intentional, it emits a continuation instead of overwriting it.

## First concrete case

The Simpli revival on Fracta is the reference case: the live checkout diverged
from GitHub, contained production Wiki state, and required service disablement
while local revival proceeds. The evidence and snapshot branch must remain
discoverable from the Operium node record and the Simpli repository history.

## Next implementation slice

1. Add a declarative FractaNet node registry.
2. Add a read-only SSH observation command producing JSONL.
3. Add idempotent divergence reports against the registry.
4. Store resumable continuations for unresolved judgments.
5. Add explicit synchronization mandates only after observation is trusted.
