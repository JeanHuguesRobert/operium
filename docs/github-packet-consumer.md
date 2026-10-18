---
title: Authorized multi-packet ONA consumer
author: unknown
affiliation: "Institut Mariani / C.O.R.S.I.C.A., 1 cours Paoli, F-20250 Corte, Corsica"
date: '2026-10-18'
license: CC BY-SA 4.0
language: en
status: working-paper — experimental implementation profile
document_role: operational
document_kind: implementation-guide
visibility: public
lifecycle_state: working
update_policy: UP-DEFAULT-REVIEWED
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/feat/issue-165-generic-consumer/docs/github-packet-consumer.md
generated_by: Codex
provenance:
  origin_type: repository
  origin_repository: JeanHuguesRobert/operium
  origin_ref: https://github.com/JeanHuguesRobert/inseme/issues/165
  origin_date: '2026-10-18'
  derived_from: []
review:
  status: unreviewed
  reviewed_by: []
---

# Authorized multi-packet ONA consumer

Resume https://github.com/JeanHuguesRobert/inseme/issues/165.

This experimental Operium implementation generalizes the
[#141 adapter](mobile-termux-diagnostic.md) through the existing ONA script-job
hook and COP event store. It adds no daemon, scheduler or default job. It has
not been deployed, activated or granted production execution authority.
The feature branch is stacked on `feat/mobile-termux-diagnostic-141`; its PR
targets that branch so the #165 delta can be reviewed separately. Neither
branch is authorized to merge into main by #165.

## Contract and authority

The new `operium.packet-request/v1` descriptor is an ONA implementation profile,
not a new COP core invariant or a replacement for the `compute.batch` Actions
contract. The latter accepts repository computations and is deliberately not
turned into a resident arbitrary-code runner. Existing Magistral
ExecutionBinding/ExecutionReceipt constructors and the `cop_events` store are
reused unchanged. A typed descriptor appears in exactly one JSON fence in an
open GitHub issue. Prose outside that descriptor is context, never shell or
authority. A changed descriptor under an admitted packet identity is rejected;
new work needs a new ID and a separately authorized grant.

```json
{
  "schema": "operium.packet-request/v1",
  "id": "example-hash-1",
  "repository": "example-owner/example-repository",
  "issue": 1,
  "operation": {"kind": "local.sha256/v1", "text": "hello"},
  "timeout_ms": 1000,
  "return": {"github_issue": 1}
}
```

Only two source-defined providers exist:

| Operation | Scope | Control reference |
| --- | --- | --- |
| `local.sha256/v1` | Hash at most 4096 UTF-8 bytes supplied as text; no file access | `operium:local-sha256:v1` |
| `mobile.termux.diagnostic/v1` | Fixed `whoami && git --version` on `poco-jhr`, through the #141 strict SSH invocation on host `fracta` | `operium:mobile-termux:v1` |

Mobile output is filtered; stderr is withheld. Timeout is 100–15000 ms, output
is bounded, and no Issue string becomes a shell command, host or executable.
SSH termination does not prove remote process termination; the two fixed
commands have no intended persistent effects. Simulation requires an injected
test executor and cannot use the default real SSH executor.

Independent authority is a locally supplied Ed25519-signed grant, verified
against an operator-controlled issuer-to-Principal/public-key mapping. The
signature covers sorted-key canonical JSON of the complete `grant` object.
No key is retrieved from GitHub and no signing/issuing command is supplied.
The grant contains:

```text
schema = operium.packet-grant/v1
id, issuer, principal
request_sha256 = SHA-256 of canonical request JSON
implementation_sha256 = actual transitive source-file digest from inspect
provider_ref, control_ref
effect_ceiling = read-only
max_executions = 1
execution = true
timeout_ms = request timeout
simulation = false for a real provider (true only in test fixtures)
not_before, expires_at = finite ISO dates
publish_receipt = separate explicit permission to return the sanitized receipt
```

The envelope is `{grant, signature}` with base64 signature. Expiry, source,
digest, provider, control, effect ceiling and budget are checked before the
claim and again immediately before execution. Local policy is reloaded around
effects. Revoked grant IDs persist as COP events and cannot be un-revoked merely
by removing them from the policy list. A local policy/key-store writer is
inside the trust boundary; protect these files like other operational authority
material. Signatures do not protect against a compromised trusted host.
Deploy only immutable source checkouts. The cached ONA module captures its
source digest at import and refuses a later tick if disk sources changed;
a fresh grant must not relabel already-loaded old code as a new implementation.

Issue authorship and signed webhook delivery establish provider observations,
not Principal authorization. Existing Inseme webhook ingress remains separate:
no webhook-to-this-consumer activation is claimed. This increment uses bounded
API reconciliation of an explicitly configured list, suitable for existing ONA
polling repair. A push wake-up may invoke the same idempotent tick only after
its ingress/control linkage is separately validated; it must not carry grants.

## Local operator surface and activation ceiling

`node scripts/ona-packet-consumer.js inspect` prints source revisions and file
digests without reading keys or executing work. The pinned tested sibling
Inseme revision is `71b9e7e6b5c8c9cbf0cd03973a77c346e85d65f6`.

`node scripts/ona-packet-consumer.js tick` runs one bounded pass only when
`ONA_PACKET_CONSUMER_POLICY` names a protected local policy. With no policy it
returns `policy_not_configured`. The same exported `runScheduledHeartbeat`
function plugs into ONA's existing `script` job; no scheduler code was changed.

Policy fields are `schema: operium.packet-consumer-policy/v1`, `enabled`, an
absolute retained `db_path`, `repositories` allowlist, `issuers` mapping
(`principal`, PEM `public_key`), `revoked_grants`, `callback_actor`, and
`requests`. Each request entry supplies `repository`, `issue`, `id` and
`signed_grant`. At most eight entries are inspected per tick. GitHub reads have
a 5-second deadline; each callback subprocess has a 10-second deadline and
bounded output. A worst-case eight-entry tick can approach eight minutes;
use one existing serial scheduler job with a suitable interval, never overlapping
parallel databases. No unlimited discovery or recursive polling is performed.
Failed observations, unavailable providers and failed callbacks leave durable
per-request repair events. Subsequent ticks defer that request for 30 seconds,
then exponentially up to 15 minutes. Other requests continue independently.
The tick reports API-read attempts and provider quota as `not_estimated`.
This is bounded repair inside the existing scheduler, not the full shared
quota/reserve allocator discussed in Inseme #89.

The store must already exist; missing stores fail closed instead of silently
creating a new execution universe. Initial provisioning, persistent activation,
keys, real grants, service restart and deployment all remain separate explicit
Principal gates. Do not reuse the expired #141 grant or its retained store for
a new experiment. Reserve a distinct new store only for a distinctly authorized
new execution identity, never to replay an uncertain old execution.

## Persistence and recovery

Observations and rejection decisions are recorded. Admitted packets enter an
event-backed queue. A SQLite `BEGIN IMMEDIATE` transaction atomically spends
the grant's one-execution budget and records the binding/claim. The receipt
is appended after provider completion. There is no automatic lease takeover:

| Recorded state | Recovery |
| --- | --- |
| Queue only, provider unavailable | Retry capability resolution under a still-valid grant |
| Claim without receipt | `needs_acceptance`; reconcile outcome, never delete claim or retry execution automatically |
| Receipt, no delivery | Retry only authorized delivery using the immutable result |
| Delivery present | Return the recorded receipt; no new provider or callback effect |
| Changed request/source/provider under same identity | Reject, even when the new grant is validly signed |
| Expired/revoked grant | No new execution or publication; retained evidence stays readable locally |

Claims coordinate only handlers sharing the same retained SQLite store. There
is no global exactly-once promise. A handler crash after claim can sacrifice
liveness to avoid duplicate effects. Grant consumption is not reset by failure.

Callback recovery checks exact body, actor, comment ID and destination. The
same SQLite transaction serializes competing local deliveries. If GitHub POST
succeeded before a crash, the next attempt recovers the exact existing comment
instead of rerunning the provider. The first 100 comments are the bounded repair
window; if full and no exact match is found, publication fails closed. Manual
reconciliation is then needed. External GitHub deletion/editing or eventual
visibility can defeat exact-body recovery; GitHub offers no transactional
idempotency key here, so global exactly-once delivery is not claimed.

## Validation and next gate

Run `node --test scripts/test-packet-consumer.js` plus the #141 provider/resident
tests and `node scripts/test-ona-jobs.js`. Tests generate ephemeral authority keys,
use temporary stores, mock GitHub and SSH, and exercise real independent worker
processes against one store. They prove local mechanisms, not live service
behavior. The dedicated CI workflow pins the sibling Inseme dependency.

Before a live Reality Test, obtain a fresh scoped Principal grant, reviewed
source revision, deployment/activation authority and callback scope. Then show
one accepted request, one unauthorized rejection, exact GitHub readback, cold
replay without duplicate execution, and retained receipts. Until then #165 is
an open continuation; no production integration success is implied.
