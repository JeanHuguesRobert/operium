---
title: "FractaCalendar — federated temporal obligations"
date: "2026-08-31"
document_role: operational
document_kind: method
visibility: public
lifecycle_state: active
owner: Operium
related:
  - "operium-cli.md"
  - "operium-node-agent.md"
  - "fix-bugs-first.md"
github_issue: 29
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "explicit-metadata"
classification_confidence: "high"
---

# FractaCalendar

FractaCalendar is the **federated, governed projection** of temporal
obligations: Operium Node Agent jobs, continuation deadlines, service
cadences, maintenance windows, human due dates, and pre-emptible background
work.

It is **not** a competing agenda and **not** a second source of truth.

GitHub: [operium#29](https://github.com/JeanHuguesRobert/operium/issues/29).

## What it is / is not

| Is | Is not |
| --- | --- |
| A projection of obligations that already have an executor | A calendar that runs work because an event exists |
| A place to record non-periodic watches with stop conditions | A replacement for Google Calendar or a personal agenda |
| Evidence + next due date + grouping by node / service / project | Authorization to act (`capable != authorized`) |
| An ICS export that a human may *view* | An implicit executor once imported into a personal calendar |

## Fractal publishing

```text
local timer or ONA job
  -> node calendar
    -> service / project calendar
      -> FractaCalendar (federated projection)
        -> personal and collective views
```

Each level publishes a **synthesis**. Only one source **executes**.

The control protocol is COP, not a DNS CLI: see
[`calendar-cop-wake-protocol.md`](calendar-cop-wake-protocol.md).
A **tick** is not a Cognitive Packet; the **work a tick delivers** is
packet-shaped (`cop/node.wake.v1` → `cop/cognitive-packet`).
`operium calendar watch dns` is sugar that builds that packet.

Catalogue cadences stay in `scheduled_jobs` and are executed by the ONA job
runner. Scheduled wakes live in `calendar_obligations` as stored wake packets.
The projection reads both and duplicates neither.

## Obligation model

Schema: [`schemas/operium.calendar.obligation.v1.json`](../schemas/operium.calendar.obligation.v1.json).

```yaml
id: dns-delegation:acorsica.org
kind: dns.watch
owner_or_mandate: observation-only
scope: project
target_node: resource://fracta
service: dns
project: acorsica.org
earliest_at:          # first check
next_run_at:
cadence_or_trigger:
  kind: after_first
  first_delay_ms: 3600000    # T+1h
  interval_ms: 10800000      # T+3h thereafter
deadline:                    # escalate at T+24h
priority: high
interruptible: true
stop_condition:
  type: nameservers_match
escalation_policy:
  after_ms: 86400000
last_run:
last_evidence:
source_of_truth: calendar_obligations:dns-delegation:acorsica.org
authorized: false
```

`authorized` is always `false` on a projection. Observing a due date does not
grant a mandate to apply nameservers, restart a node, or send mail.

## Surfaces

| Surface | Role |
| --- | --- |
| `operium calendar list` | Local SQLite projection (`operium.calendar.projection.v1`) |
| `operium calendar schedule --file` | Accept a `cop/node.wake.v1` packet (preferred) |
| `operium calendar watch dns` | Sugar that builds a DNS **observation** wake packet |
| `operium calendar tick` | Local tick: deliver due wakes to handlers |
| `operium calendar ics` | ICS export; header `X-OPERIUM-NOT-EXECUTOR:1` |
| `operium node calendar` | Same projection via `GET /node/calendar` |
| `GET /node/calendar` | ONA read surface |
| `POST /node/calendar/watch` | Admin: create a DNS watcher |
| `POST /node/calendar/tick` | Admin: run due watchers now |
| ONA job tick | Also runs due calendar obligations after catalogue jobs |

## DNS watcher (acceptance demo)

Example from issue #29: watch `acorsica.org` until public NS records match
the expected set, then **auto-close**.

```bash
operium calendar schedule --file examples/cop-node-wake.dns-observation.json
# sugar for the same observation payload:
operium calendar watch dns \
  --domain acorsica.org \
  --expected-ns ada.ns.cloudflare.com,bob.ns.cloudflare.com \
  --first-delay 3600000 \
  --interval 10800000

operium calendar tick --json
operium calendar list --human
```

The watcher:

1. Resolves public NS over DNS-over-HTTPS (no registrar API, no secrets).
2. Compares the normalized set to `--expected-ns`.
3. Records evidence (`public_ns`, `expected_ns`, `matched`).
4. Closes itself when they match (`stop_condition: nameservers_match`).
5. Marks `escalated` if the deadline passes while they still diverge.
6. Never calls Gandi or Cloudflare write APIs. Applying a nameserver cutover
   remains a separately authorized tool (`scripts/ops/cloudflare-nameserver-cutover.js`).

## Personal calendar interop (future)

ICS export is a **view**. Importing it into a personal calendar must not:

- become an executor;
- widen mandate;
- copy private node secrets or tokens;
- schedule COP Acts.

Later work may subscribe a personal calendar to a public projection URL. The
personal calendar remains a human attention surface.

## Invariants

- `capable != authorized`.
- A projection does not replace the executor or the mandate holder.
- Every run stores evidence, a result, and a computable next due date (or
  closure).
- Background work uses residual qualified capacity; it is pre-emptible and
  checkpointable (future; not in this slice).
- Human-engaging acts stay behind explicit approval.

## Out of scope (this slice)

- Replacing a personal or institutional agenda.
- Automatic engaging acts.
- Centralizing private node data.
- Continuations from Cogentia (they may be projected later; they are not
  executed here).
- Corpus Sleep Cycle / FractaScheduler (Cogentia corpus ops, not this
  calendar).
