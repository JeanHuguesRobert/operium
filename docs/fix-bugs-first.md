---
title: "Fix Bugs First — Bug/Feature tracking (Operium)"
date: "2026-07-26"
document_role: operational
document_kind: doctrine
visibility: public
lifecycle_state: active
owner: Operium
related:
  - "../doctrine.md"
  - "operational-health.md"
  - "operium-wip.md"
  - "../backlog/README.md"
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "explicit-metadata"
classification_confidence: "medium"
---

# Fix Bugs First

When a project (or operational plane) gets **out of control**, stop inventing
features and **restore control through a Bug/Feature tracking system**.

This is an old operator doctrine, restated for Operium and interactive
multi-agent development.

**Attention vs engagement.** Toward the human Principal, Fix Bugs First is an
**attention reminder** (pending judged-priority work). It is not the
Engagement Gatekeeper (HITL for externally engaging Acts). It does not block,
constrain, or surveil the Principal. Shared agent wording:
[`cogentia/instructions/AGENTS.shared.md`](https://github.com/JeanHuguesRobert/cogentia/blob/main/instructions/AGENTS.shared.md)
(section *Fix Bugs First is an attention reminder*). The mechanical
subsystem `gate` below remains **agent self-discipline** for unsolicited
feature work on a broken ops surface — not a lock on Jean Hugues Robert.

## One-line rule

> **Known bugs block new features in the same subsystem**, unless an explicit
> waiver is recorded on the bug (or on the feature with a link to the waiver).

“Bug” here means **observed wrong behaviour or broken operational loop**, not
“something we wish existed.”

## Why tracking is the doctrine

Fix Bugs First is not a slogan. It is the discipline of maintaining a
**reasonably sophisticated Bug/Feature register** that is:

| Property | Meaning |
|----------|---------|
| **Typed** | Every item is `bug`, `feature`, `incident`, or `debt` (debt is optional; prefer `bug` when something is broken) |
| **Scoped** | Every item has a **subsystem** (e.g. `secrets`, `magistral-routing`, `ona`, `mesh`, `console`) |
| **Prioritised** | Bugs have **severity** (`critical` / `high` / `medium` / `low`) |
| **Evidence-based** | Bugs cite how we know (probe, log, failed smoke, user report) — not vibes |
| **Actionable** | Every open item has a `next_action` a human or agent can execute |
| **Gated** | Features in a subsystem are **blocked** while open bugs of severity ≥ `high` exist there |
| **Versioned** | The register lives in git (Operium `backlog/`) and may mirror GitHub Issues |
| **Agent-readable** | YAML + CLI; not only a web UI |

Without that register, “fix bugs first” collapses into whoever shouts loudest
or whatever the last interactive session touched.

## Mapping to Operium vocabulary

| Tracking field | Operium / health analogue |
|----------------|---------------------------|
| `bug` | Fact of broken or fragile behaviour; often health score ≤ 2 for that surface |
| `feature` | **Intended evolution** (not current state) |
| `incident` | Time-bounded breakage; may open/close a bug |
| `severity` | How hard the environment fails if unfixed |
| `subsystem` | Operational surface / component boundary |
| `next_action` | Same spirit as health `next_actions[]` |
| `waiver` | Explicit exception — still versioned, never silent |

Doctrine still holds: do not present an intended evolution as current state.
A `feature` item is never “already done” until status says so and evidence
exists.

## Gate (mechanical)

For subsystem `S`:

1. List open items with `kind: bug` and `subsystem: S`.
2. If any have `severity` in `{critical, high}` and no active `waiver`, then:
   - **blocked:** new work whose primary kind is `feature` in `S`
   - **allowed:** bug fixes, documentation of facts, probes, incident response,
     and waivers with expiry/reason
3. `medium` / `low` bugs do **not** hard-block features, but they stay visible
   and should be scheduled; a subsystem full of medium bugs is still “out of
   control” socially even if the gate is green.

CLI:

```bash
operium backlog list --human
operium backlog list --kind bug --status open
operium backlog gate --subsystem secrets
operium backlog gate --subsystem magistral-routing --json
```

Exit codes for `gate`:

| Code | Meaning |
|-----:|---------|
| 0 | No blocking bugs (or only waived) |
| 1 | Features blocked — open high/critical bugs |
| 2 | Backlog unreadable / invalid |

## Dual plane: git register + GitHub

| Plane | Role |
|-------|------|
| **`backlog/items.yaml`** | Operium **authority** for triage, gate, and agent sessions |
| **GitHub Issues** | Discussion, notifications, cross-repo links; labels must match kind |

Rules:

1. Create/update the YAML item **first** (or in the same change as the issue).
2. Optional `github_issue: N` links the discussion thread.
3. Closing: set YAML `status: done` with `closed_at` + evidence; close GH issue.
4. Do not open a `feature` issue for a subsystem that fails `operium backlog gate`
   without a waiver on the blocking bug(s).

## Severity guide (bugs)

| Severity | Use when |
|----------|----------|
| `critical` | Critical path broken (Guide synthesis dead, mesh unusable, secret mismatch everywhere) |
| `high` | Major operational loop broken or flaky; interactive sessions burn time |
| `medium` | Partial failure, workaround exists, or single node |
| `low` | Cosmetic, docs drift, rare path |

## Interactive development protocol

When an agent or human starts work in Operium (or ops-touching corpus work):

1. `operium backlog list --kind bug --status open --human`
2. `operium backlog gate --subsystem <S>` for the subsystem you would change
3. If gate fails → fix or waive a **bug**, do not start the feature
4. When interrupted → `operium handoff wip` (WIP is orthogonal; it does not
   replace the backlog)

## Anti-patterns

- Renaming bugs to “debt” or “enhancement” to skip the gate
- Feature PRs that “include a small fix later”
- GitHub Issues with no kind / no subsystem / no next_action
- Using the register or dashboard to block, score, or watch the Principal
- Treating a Principal override as an incident or as missing waiver theatre
- Parallel freestyle ops scripts that bypass the register
- Waivers without `reason`, `owner`, and `expires_at`

## Related

- [`backlog/README.md`](../backlog/README.md) — register format
- [`operational-health.md`](operational-health.md) — health scores
- [`operium-wip.md`](operium-wip.md) — session handoff (not the backlog)
- Classic XP-adjacent slogan: [Fix Bugs First (c2)](https://wiki.c2.com/?FixBugsFirst) — same impulse; Operium makes it **tracked and gated**

## Provenance (historical, not ops)

The idea predates Operium. It was practiced at **Perform** (Aix-en-Provence,
software house, ~1987–1997) as a way to regain control of product work when
what later became widely called **technical debt** still lacked a stable common
name — and it was discussed on the original c2 wiki. The **historical** note
(Perform, SAGE/X, selling multi-vendor **negotiation power**, evidence
statuses) lives in barons-Mariani, not here:

[perform_fixbugsfirst_technical_debt_negotiation_power.md](https://github.com/JeanHuguesRobert/barons-Mariani/blob/main/research/perform_fixbugsfirst_technical_debt_negotiation_power.md)

Operium owns the **current** Bug/Feature gate. barons-Mariani owns the
**lineage and memory**.
