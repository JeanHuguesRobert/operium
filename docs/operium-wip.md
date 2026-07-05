---
title: "Operium WIP Handoff"
description: "Reliable GitHub-backed handoff/resume workflow for interrupted work."
layout: default
date: 2026-07-05
last_modified_at: 2026-07-05
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/operium-wip.md
document_role: "operational"
document_kind: "method"
visibility: "public"
lifecycle_state: "active"
---

# Operium WIP handoff

`operium handoff wip` and `operium resume wip` make an interrupted local Git working state
resumable from another trusted node.

The design is intentionally GitHub-backed:

```text
local working tree
  -> WIP commit
  -> wip/<topic> branch
  -> git push
  -> resume from another clone
```

This replaces `git stash` for cross-machine work. A stash is local, easy to forget, and invisible
from a phone, VPS, or another workstation. A WIP branch is versioned, auditable, discussable, and
fetchable.

## Branch convention

Use one branch per resumable work topic:

```text
wip/fractanet-android-node
wip/corpus-index-refresh
wip/docs-cleanup
```

`--topic fractanet-android-node` resolves to `wip/fractanet-android-node`.

Use `--branch <name>` when an agent has already selected the exact branch.

## Commands

```bash
operium wip status --topic fractanet-android-node
operium handoff wip --topic fractanet-android-node
operium resume wip --topic fractanet-android-node
```

JSON is the default output because agents are the primary callers. Add `--human` for a short human
summary.

## PC handoff

On the machine where the work is currently dirty:

```bash
cd ~/repos/operium
operium wip status --topic fractanet-android-node
operium handoff wip --topic fractanet-android-node
```

The command refuses dangerous states such as detached HEAD, unresolved conflicts, rebase/merge in
progress, or a remote WIP branch that is ahead of the local clone.

## Android / Termux resume

On `poco-jhr` or another Termux node:

```bash
cd ~/srv/cogentia/repos/operium
operium resume wip --topic fractanet-android-node
```

If the local working tree is dirty, resume refuses by default. An agent can decide to run a handoff
first:

```bash
operium resume wip --topic fractanet-android-node --auto-handoff-first
```

Use `--allow-dirty` only when the caller knows that the local changes will not conflict.

## fracta resume

On `fracta`:

```bash
cd /srv/cogentia/repos/operium
operium resume wip --topic fractanet-android-node
```

The command fetches `origin`, creates the local WIP branch from `origin/wip/<topic>` if needed,
switches to it, and runs `git pull --ff-only`.

## Secret guard

Before a handoff commit, Operium refuses paths that look like secrets:

```text
.env
*.env
*secret*
*token*
*credential*
id_rsa
id_ed25519
fractanet-mesh
*.pem
*.key
*.p12
*.pfx
```

The guard reports only paths, never file contents.

## Agent usage

Agents should normally call:

```bash
operium wip status --topic <topic> --json
operium handoff wip --topic <topic> --json
operium resume wip --topic <topic> --json
```

If `wip status` reports no candidate branch, the agent must choose a topic or exact branch. If
`handoff wip` refuses with `secret_like_paths_detected`, the agent must not print the file contents;
it should ask for removal, ignore, or explicit user handling.

## Human examples

Dry run:

```bash
operium handoff wip --topic docs-cleanup --dry-run --human
```

Custom message:

```bash
operium handoff wip --topic docs-cleanup --message "wip: docs cleanup before phone resume"
```

Resume exact branch:

```bash
operium resume wip --branch wip/docs-cleanup
```

## Limits in this iteration

- Single repository only.
- No `--all` orchestration yet.
- No content scanning for secret values; only path-based refusal.
- No automatic branch topic inference beyond current `wip/*`.
- No conflict resolution; conflicts remain an explicit human or agent task.

The library functions are structured so a future multi-repo coordinator can call the same status,
handoff, and resume primitives for each declared clone.
