---
title: "FractaCalendar ↔ COP wake protocol"
date: "2026-08-31"
document_role: operational
document_kind: method
visibility: public
lifecycle_state: active
owner: Operium
related:
  - "fracta-calendar.md"
  - "../schemas/cop/node.envelope.v1.json"
  - "../schemas/cop/node.wake.v1.json"
github_issue: 31
supersedes_cli_verb: "operium calendar watch dns"
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "explicit-metadata"
classification_confidence: "high"
---

# FractaCalendar ↔ COP wake protocol

`operium calendar watch dns` is a **demo payload**, not a control-plane verb.
It does not generalize. The control layer must not grow a CLI noun per
domain (DNS, mail, continuations, maintenance).

The protocol between **planned work** and **control** is already named in COP
and Cognitive Packets. FractaCalendar is a **projector**, not an executor.

## COP candidates (already specified)

From Inseme COP Architecture (`cop-core/Architecture.md`):

| COP object | Role here |
| --- | --- |
| **Tick** (§5.2.4) | Synthetic trigger. **Not** an Event. MUST NOT mutate COP state. |
| **Event** | Only durable mutation. Wake, evidence, close, escalate are Events. |
| **Task** | Projection of work inside a Topic. **Not** the source of truth. |
| **Handler** | Stateless, idempotent. `onEvent(event, context) → Events`. |
| **Continuation** | Payload when the missing input is **judgment**. |
| **Artifact** `cop/cognitive-packet` | Envelope + payload unit of work the tick *delivers*. |
| **Scheduler** | Delivers Events / scans resumable continuations on ticks. |

Cognitive Packets (`cogentia/research/cognitive_packets.md`):

```text
envelope  → kind-agnostic (who, when, status, routing, traces)
payload   → kind-specific (continuation | observation | …)
```

New payload kinds may be added **without** changing the envelope. DNS is a
payload, not a protocol.

## Is a scheduled task a Cognitive Packet?

**The tick is not.** COP: ticks are synthetic triggers, not Events.

**The work the tick delivers should be packet-shaped.** Envelope + payload,
transmitted by copy or by reference, dispatched by `packet_kind` / work kind.

| Thing | Packet? | Why |
| --- | --- | --- |
| ONA / COP tick | no | Clock. No durable effect of its own. |
| Catalogue heartbeat | COP **Event** (`cop/attractor.advertised`) | Mechanical advertisement, not cognitive work. |
| Deterministic observation (NS match, HTTP health) | Cognitive Packet, `packet_kind: observation` | Envelope for routing/trace; payload is the check. |
| Human deadline / engaging act | Cognitive Packet, `packet_kind: continuation` | Missing input is judgment / mandate. |
| FractaCalendar row | **Projection** of Events + packets | Same as a COP Task: explainable by replay, not a second SoT. |

So: do not say “every cron job is a Cognitive Packet.” Say: **control never
executes a domain verb; it delivers a packet (or Event) to a handler.**

## Protocol

```text
tick
  --must not mutate-->
emit cop/node.wake.v1 (Event)
  payload.due_at, cadence, deadline, stop_condition
  payload.packet  (Cognitive Packet by copy)
       OR payload.packet_ref (by reference)
  -->
Handler
  reads envelope first
  dispatches on packet.envelope.packet_kind then payload.kind
  emits evidence Event
  emits next wake Event  OR  close Event
  -->
FractaCalendar projector
  synthesizes obligations from wake Events + scheduled_jobs
```

The durable log is SQLite `cop_events` (not TTL-swept). `calendar_obligations`
is a COP Task-style **projection** rebuildable by replaying wake / evidence /
close / escalate Events. Opening the node DB backfills a wake Event for any
pre-v5 obligation that already stores `config.wake`, so replay does not drop
live rows. Warm `event_log` (`ona.calendar.ran` /
`ona.calendar.closed`) remains an operational breadcrumb with a 14-day TTL; it
is not the source of truth.

Catalogue cadences (`scheduled_jobs`, including ONA heartbeats) stay Events of
kind `cop/attractor.advertised`. They are **projected** into FractaCalendar.
They are not wrapped in `cop/node.wake.v1` packets.

A wake may carry `packet_kind: continuation` by copy. Dispatch uses the same
handler table as `observation.*`. Continuations stay `authorized: false` until
a real COP/HITL path exists. There is no `operium calendar watch continuation`
verb: new observations are a packet file plus a handler.

Remaining intended evolution (HITL resolve, `packet_ref`) is **not** current
state: GitHub [#40](https://github.com/JeanHuguesRobert/operium/issues/40),
handoff [`research/handoff-calendar-cop-2026-08-31.md`](../research/handoff-calendar-cop-2026-08-31.md).

Invariants (unchanged from issue #29):

- `capable != authorized` — a wake does not grant a mandate.
- One executor. The calendar does not become a second runner.
- Stop conditions and cadences live on the **wake Event / packet envelope**,
  not in a DNS-specific CLI.
- Personal ICS remains a view (`X-OPERIUM-NOT-EXECUTOR`).

## Surfaces

The **capability** is stable. Interfaces are adapters for a consumer class
(human operator, agent, peer node, public observer). They share schemas
(`operium.calendar.projection.v1`, `cop/node.wake.v1`). They do not grow
domain verbs.

ACP is **not** a calendar transport. It is a coding-agent session protocol
(Codex on Fracta). An ACP agent that needs the calendar uses MCP
(`operium_calendar_list`) or the CLI. Do not add calendar verbs to ACP.

### Capabilities (not CLI nouns)

| Id | Effect | Auth |
| --- | --- | --- |
| `calendar.list` | Read projection | read |
| `calendar.schedule` | Accept a wake packet (by copy) | admin |
| `calendar.tick` | Deliver due wakes (local tick) | admin |
| `calendar.ics` | ICS view of the same projection | read |

`calendar.watch.dns` is **not** a capability. It is sugar that builds a
`cop/node.wake.v1` whose payload kind is `observation.dns.delegation`.

### Adapter matrix (observed 2026-08-31)

| Capability | CLI | ONA HTTP | COP packet | Fracta `/ops/node` proxy | MCP | Web UX |
| --- | --- | --- | --- | --- | --- | --- |
| `calendar.list` | `operium calendar list` / `operium node calendar` (same HTTP) | `GET /node/calendar` | `cop/node.query.v1` query=`calendar` or `cop_events` | `GET /ops/node/:id/calendar` (Cogentia #125, ops-read token) | `operium_calendar_list` (private-read / JHN; not anonymous) | La Nasa node pack (`/nasa/node`); public `/ops/console` stays empty |
| `calendar.schedule` | `operium calendar schedule --file` | `POST /node/calendar/schedule` | `cop/node.wake.v1` on `POST /node/cop` | no | none | no |
| `calendar.tick` | `operium calendar tick` | `POST /node/calendar/tick` | ONA job tick also runs due wakes | no | none | no |
| `calendar.ics` | `operium calendar ics` | none (derive from GET) | none | no | none | no |
| DNS sugar | `operium calendar watch dns` | `POST /node/calendar/watch` | — | no | none | no |

Default CLI output is JSON (`--json`). `--human` is the operator adapter of
the same schema. That JSON is the wire shape HTTP/MCP/COP should reuse.

### Intended symmetry

```text
same capability
  → CLI    human flags / machine JSON
  → HTTP   REST on the node (ONA)
  → COP    query Event / wake Event (peer nodes)
  → MCP    tool wrapping the capability (agents; not anonymous public mutate)
  → Web    authenticated operator view; public La Nasa = counts at most
  → ICS    personal-calendar view, not an executor
```

JSON-RPC appears as **MCP** (`POST /mcp` JSON-RPC) on Cogentia, not as a
second Operium RPC server. Do not fork a calendar catalog under Operium.

### Visitor vs mesh

Anonymous **public** visitors (HTTPS on `*.fractavolta.com`) get the empty
console and 401 on `/ops/node/…` without an ops-read token.

Hosts **inside the Tailscale trust perimeter** hitting the node or the
aggregator on a tailnet address get the same GET read surfaces as
`ONA_MESH_OPEN_READ` (status, SOMA, calendar). They do not get `schedule` or
`tick`. Browsing the public hostname while connected to Tailscale is still
the public visitor path.

### CLI

Default transport is **ONA HTTP**, same as `operium node status`. `--local`
opens the node SQLite in-process (tests, or no daemon). Both paths call
`lib/calendar-capabilities.js`.

```bash
operium calendar list [--json|--human] [--service S] [--project P]
operium calendar schedule --file path/to/wake-packet.json
operium calendar tick [--json|--human]
operium calendar ics
operium node calendar [--json|--human]   # alias of calendar.list over HTTP
operium calendar watch dns …             # sugar only
operium calendar list --local            # in-process SQLite
```

## Example wake packet

See [`examples/cop-node-wake.dns-observation.json`](../examples/cop-node-wake.dns-observation.json).
The DNS fields exist only inside `payload.packet.payload`. The control layer
does not know what a nameserver is.
