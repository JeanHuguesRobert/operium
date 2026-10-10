---
title: Mobile Termux diagnostic — Inseme 141
language: en
document_role: operational
document_kind: implementation-guide
visibility: public
lifecycle_state: working
---

# Mobile Termux diagnostic

Scope: [Inseme #141](https://github.com/JeanHuguesRobert/inseme/issues/141).
This experimental ONA handler consumes that named GitHub packet through a
one-shot API reconciliation. It reuses Inseme's GitHub-to-COP mapper and
Magistral ExecutionBinding/ExecutionReceipt constructors, and ONA's durable
`cop_events` table. It does not establish webhook consumption or a resident
GitHub consumer. Keep sibling Inseme and Operium checkouts available.

## Operator interface

From the workspace root, after explicit authorization of the diagnostic:

```sh
node operium/scripts/mobile-termux-diagnostic.js --execute-authorized --db /path/to/mobile-141.sqlite
```

Omit `--execute-authorized` and `--db` to prepare only. The flag records a
trusted local operator's assertion of the existing Principal mandate; GitHub
content is never treated as authority. The CLI accepts no commands or targets.
It uses the existing `fracta` SSH alias and existing verified Android identity.
On Fracta itself add `--on-fracta`; actual OS hostname must be `fracta`.
Use the same durable database on every retry and retain it. Separate databases
do not share claims and can duplicate execution; this is a single-store profile,
not distributed exactly-once execution.

Only `whoami && git --version` runs on Android. Strict host checking, batch
authentication, no agent forwarding, bounded output, and a 15-second remote SSH
deadline are fixed in source. The outer relay has a 20-second deadline. Killing
SSH cannot prove remote process termination; these two read-only commands have
no persistent intended effects. No SSH trust changes or service restarts occur.

The Issue body is hashed, never interpreted as shell. Its URL, author, open
state and number are checked. The request is an implementation profile using
`cop.compute-request/v1`, outside the #120 generic `compute.batch` validator;
it cannot be passed to that Actions workflow. The local operator selects the
fixed operation. The observed GitHub event is explicitly reconciliation, not
a claimed signed webhook. This is one bounded request per retained database.

Before provider invocation, a SQLite `BEGIN IMMEDIATE` transaction persists
the COP observation, exact request, authorization assertion, source hashes and
ExecutionBinding. A cold retry returns the recorded result. If only a claim
exists, it returns `needs_acceptance` without rerunning. A changed body with the
same computation ID is rejected. Timestamp-only edits do not defeat replay.

Receipts include source commit IDs plus actual file hashes (covering uncommitted
implementation), route, local handler/provider run UUID, UTC timestamps, exit
status and filtered output. The UUID identifies the ONA invocation, not a
remote SSH server job. Only expected username and Git-version lines survive;
raw stderr is withheld. Test executions use a separate claim namespace and
`provider:simulation`.

## GitHub projection and recovery

The CLI emits a `cop.compute-result/v1` object. Under the issue's reporting
mandate, project that exact sanitized object to #141 with marker
`<!-- cop-compute-result:inseme-141-mobile-diagnostic-v1 -->`. Check existing
comments for the same provider execution UUID before posting, then read back
the comment and record its URL. Reporting is a separate operator/connector
step in this version; `delivery: pending` describes the stored outbox state.
Retry publication from the stored result, never by deleting the execution claim.
No token is required for the public GitHub read. No credentials are copied.

## Resident activation continuation

Status: `needs_acceptance`. The new ONA job kind is available to explicitly
configured jobs but has no default registry entry. No live ONA deployment,
periodic GitHub polling, resident authorization policy or timer is enabled.
The existing nightly sleep scheduler remains unchanged.

Smallest next decision: authorize a reviewed feature revision and its Inseme
dependency on Fracta, a dedicated durable diagnostic database, and one resident
ONA integration test. Before activation, reconcile Fracta's existing dirty
Operium checkout; do not overwrite it. A permanent consumer additionally needs
an explicit request admission/revocation policy and a bounded delivery worker.

Rollback: retain the durable claim/receipt database, remove the opt-in job if
later enabled, and restore the prior code revision. Do not delete claims to
retry an unknown outcome. No production configuration changed in preparation.

## Validation

```sh
node --test operium/scripts/test-mobile-termux-diagnostic.js
node operium/scripts/test-ona-jobs.js
```

Tests use temporary SQLite stores and simulated providers. Actual diagnostic
evidence must be reported separately and must never be inferred from these tests.

## Observed Reality Test — 2026-10-10

The authorized one-shot API reconciliation ran on the Termux workspace through
Fracta back to Android at 09:36:00.939–09:36:05.120 UTC. Exit code 0; output
was `u0_a393` and `git version 2.56.0`. Provider invocation UUID:
`53b2e619-6133-4732-b6ce-da97fffa9c33`. The local OS hostname is
`localhost`; it is not a Fractanet node identity.

See [the original receipt](evidence/mobile-141-receipt.json). Its source commit
identifies the baseline; file hashes identify the then-uncommitted implementation.
A fresh CLI process returned the same receipt with `replayed: true` and no
new SSH call. Eight handler tests and the existing ONA job suite passed on
Node 22.23.1. Resident consumption and automated GitHub delivery remain unproven.
