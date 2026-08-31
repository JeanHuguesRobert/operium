---
title: "Handoff — FractaCalendar COP remaining depth (2026-08-31)"
description: "Pause/resume note after Operium #31 Event log shipped. Intent and next steps for another machine or coding agent."
date: 2026-08-31
status: active
topic: calendar-cop
document_role: "source"
document_kind: "research-paper"
visibility: "public"
lifecycle_state: "active"
github_issue: 40
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "research-paper"
classification_confidence: "medium"
---

# Handoff — FractaCalendar COP remaining depth (2026-08-31)

Portable context for a **later session** (possibly another machine and another
coding agent). GitHub issue **[#40](https://github.com/JeanHuguesRobert/operium/issues/40)**
is the discussion mirror. Operium `backlog/items.yaml` is the typed register.

Conversation continuity is **this file + issue #40**, not a chat UI history and
not a vendor-local agent memory silo.

## What this pause is / is not

| Is | Is not |
| --- | --- |
| Remaining **intended evolution** after #31 | Uncommitted calendar code (that work is on `main`) |
| A successor-agent brief | A mandate to reopen surfaces or mesh vs public |
| Fact vs intended evolution, kept distinct | A stash of secrets or live tokens |

`operium handoff wip` is **not** required for the calendar Event-log work: that
landed on `main` (#38). Use a `wip/<topic>` branch only if you later have a
dirty tree. A `git stash` is local and invisible from another clone.

## Git pins (2026-08-31)

| Repo | Ref | Note |
| --- | --- | --- |
| `operium` | `main` `37ffcc2` | #38 Event log + #39 www TLS docs |
| Cogentia | unchanged for this slice | MCP catalog stays in Cogentia; do not fork a third tool table |

Live fracta Operium checkout was fast-forwarded to the same `main`. Stash
`fracta-wip-pre-calendar-main` was **left in place**. Do not `stash pop`
blindly.

## Done (do not redo)

- Surfaces and mesh vs public: issues #29, #32–#36, Cogentia #125–#127.
- Event log as source of truth: `cop_events` (schema v5, not TTL-swept).
  `calendar_obligations` is a rebuildable projection.
- Catalogue heartbeats stay `scheduled_jobs` / `cop/attractor.advertised`.
- Continuation **accept + dispatch**: `packet_kind: continuation`, same handler
  table as `observation.*`, `authorized: false`. No `watch continuation` CLI.
- Live apply: ONA restart; loopback calendar 200; public encoded ops calendar
  path 401; `continuation:live-apply-38` scheduled on fracta (pending, not
  closed).

Doctrine: [`docs/calendar-cop-wake-protocol.md`](../docs/calendar-cop-wake-protocol.md).

## Remaining (priority)

1. **COP/HITL resolve for continuation wakes** (backlog `OP-FEAT-010`) — handler
   records `pending` only. Do not grant a mandate from a tick.
2. **`packet_ref` by-reference wakes** (backlog `OP-FEAT-011`) — protocol allows
   it; implementation is by-copy only.
3. **New observation kinds** — packet file + handler. No new domain CLI verbs.

## Leave closed

Anonymous MCP mutate, public web `schedule`/`tick`, ACP calendar verbs, node
identities on `/ops/console`. Do not reopen surface/mesh work unless live
evidence contradicts it.

## Observed residual (not classified as a calendar bug)

After the ONA restart, fracta `GET /node/status` was `health_score=2` /
`ok=false` with `probe_history=500`. Reopen as a bug only with new evidence.

## Local leftover (this workstation only)

Stash `wip: mail + dns cutover` (not calendar). If that work should survive a
machine change, convert it to `wip/<topic>` and push. Do not confuse it with
the fracta stash `fracta-wip-pre-calendar-main`.

## Resume prompt

```text
Resume Operium calendar COP remaining depth after #31.
Read operium/research/handoff-calendar-cop-2026-08-31.md and GitHub issue #40.
Do not redo Event log or surfaces. Do not pop fracta stash fracta-wip-pre-calendar-main.
```
