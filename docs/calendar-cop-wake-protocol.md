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
github_issue: 29
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

Invariants (unchanged from issue #29):

- `capable != authorized` — a wake does not grant a mandate.
- One executor. The calendar does not become a second runner.
- Stop conditions and cadences live on the **wake Event / packet envelope**,
  not in a DNS-specific CLI.
- Personal ICS remains a view (`X-OPERIUM-NOT-EXECUTOR`).

## Surfaces

Preferred:

```bash
operium calendar schedule --file path/to/wake-packet.json
operium calendar list
operium calendar tick    # local COP-style tick: deliver due wakes, do not
                         # invent domain verbs
```

Deprecated as protocol (kept as sugar that *builds* a wake packet):

```bash
operium calendar watch dns --domain … --expected-ns …
```

## Example wake packet

See [`examples/cop-node-wake.dns-observation.json`](../examples/cop-node-wake.dns-observation.json).
The DNS fields exist only inside `payload.packet.payload`. The control layer
does not know what a nameserver is.
