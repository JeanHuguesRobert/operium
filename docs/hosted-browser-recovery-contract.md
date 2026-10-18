---
title: Hosted Browser functional health and bounded RFB recovery
author: unknown
affiliation: "Institut Mariani / C.O.R.S.I.C.A., 1 cours Paoli, F-20250 Corte, Corsica"
date: '2026-10-18'
license: CC BY-SA 4.0
language: en
status: draft
document_role: operational
document_kind: continuation
visibility: public
lifecycle_state: working
update_policy: UP-DEFAULT-REVIEWED
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/hosted-browser-recovery-contract.md
generated_by: Codex
provenance:
  origin_type: repository
  origin_repository: JeanHuguesRobert/operium
  origin_ref: https://github.com/JeanHuguesRobert/cogentia/issues/263
  origin_date: '2026-10-18'
  derived_from: []
review:
  status: unreviewed
  reviewed_by: []
---

# Hosted Browser functional health and bounded RFB recovery

Prepared operational correction packet for **OP-BUG-010** in
[the authoritative backlog](../backlog/items.yaml), continuing
[Cogentia #263](https://github.com/JeanHuguesRobert/cogentia/issues/263).
Production recovery is **BLOCKED_ON_AUTHORITY**; preparation and bounded
read-only diagnosis remain eligible. This packet is not a deployment receipt.

## Activate controls and establish the baseline

Read [Operium's mandate](../AGENTS.md), [Fix Bugs First](fix-bugs-first.md),
[shared instructions](https://github.com/JeanHuguesRobert/cogentia/blob/main/instructions/AGENTS.shared.md),
and [the source contract doctrine](https://github.com/JeanHuguesRobert/cogentia/blob/ebedcaf1c5f3a011f46aec5267b1d9657ca959f9/research/optimistic_mainline_governance.md#33-optimistic-execution-by-contract-meyer).
Run `operium backlog list --kind bug --status openish --human` and
`operium backlog gate --subsystem hosted-browser`. A blocked feature gate
allows this bug investigation and correction; it does not authorize deployment.

On 2026-10-18, fetched Operium main was `64413269cc87a31a949b39851b569e62ee22cb91`.
The primary workspace was on `wip/mail-dns-cutover`, with a materially different
Hosted Browser implementation and two unpushed commits. Do not merge that whole
branch to obtain a health script. The existing main worktree was fast-forwarded;
its unrelated simulator document edit was preserved.

The [listener health script at 6076f0b](https://github.com/JeanHuguesRobert/operium/blob/6076f0b/templates/hosted-browser/check-hosted-browser-health.sh)
accepts local HTTP 200/401/403 and otherwise restarts the main browser unit,
without a post-restart functional check. It is absent from inspected main.
Deployment identity is unknown: inspect the deployed unit/script revision before
choosing a patch target. Review the branch script as evidence, not deployed truth.

The existing [COP contract helper](https://github.com/JeanHuguesRobert/inseme/blob/main/packages/cop-host/src/lib/contract.js)
provides `require`, `ensure`, and `check` assertions. It grants no authority and
provides no recovery orchestrator. Reuse it if implementation is hosted in COP;
do not introduce a cross-repository runtime dependency merely for these assertions.

## Evidence and separate probe ownership

The parent issue reports transient public HTTPS failure around 08:17 Europe/Paris
on 2026-10-18 and a TLS-edge HTTP 401 at 08:20. It also reports proxy upstream
timeouts at 08:37–08:41 and a listening RFB process whose localhost connect
failed with a full accept backlog. These are inherited observations, not live
measurements by this handler. The original HTTPS cause remains unknown.

| Path / owner | Bounded observation | What it establishes |
|---|---|---|
| Public HTTPS / Fracta edge | DNS, TLS validation, expected authentication challenge, then authorized authenticated browser session | Edge reachability separately from usable browser interaction |
| Local HTTPS / fracta2 KasmVNC | HTTP response and authorized session interaction | Listener reachability separately from desktop usability |
| Local RFB / fracta2 projection unit | Timed connect and valid RFB banner, then authorized authentication/framebuffer update | Protocol liveness separately from usable desktop projection |
| Public RFB / Fracta socket proxy | Same protocol probes through the intended client path | End-to-end forwarding separately from local RFB health |

An HTTP 401 or an RFB banner alone is not end-to-end functional success. Do not
publish credentials or framebuffer contents. Record only redacted result classes,
timestamps, observer, target role, duration and revision. Never infer that the
RFB defect caused the HTTPS incident without dependency evidence.

## Smallest correction and execution contract

- **Preconditions:** refresh source and deployed revisions; discover the current
  read-only capability through `operium up` / `operium invoke tool`; verify its
  effect class. Inspect service dependencies, recent bounded logs and active
  client/session impact. Unknown client impact fails the restart gate. Missing
  capability returns a precise continuation, not an ad-hoc SSH control plane.
- **Prepared action:** add independent bounded HTTPS and RFB checks to the
  authoritative implementation. Keep observations distinct from recovery.
  Propose at most one restart of the affected RFB projection instance through
  an explicitly authorized Operium capability. No parent browser, Caddy, socket
  proxy, credential, firewall or unrelated instance changes are included.
- **Invariants:** retain the underlying browser/X session and its data; preserve
  privacy, authentication and unrelated sessions. An RFB restart disconnects
  RFB clients even if the underlying desktop survives: that impact must be
  explicitly accepted or verified absent immediately before execution.
- **Postconditions:** within a proposed 30-second recovery budget, verify local
  RFB protocol response, the intended forwarded path, and an authorized usable
  framebuffer update; check the parent browser session remains intact. A zero
  restart exit code is only an execution receipt. Missing functional evidence
  is `UNVERIFIED`, never `RECOVERED`.
- **Failure/recovery:** capture bounded evidence, stop after one attempt, and
  return the failed postcondition. No automatic restart loop or escalation to
  parent-unit restart. For a later code deployment retain the previous artifact
  and restore it only under the deployment mandate; rollback cannot undo a
  disconnected client session. Bound probe retries to the agreed budget.
- **Concurrency/escalation:** compare expected unit/script revision and session
  state immediately before action. On drift, re-read and reconcile. Stop for
  missing authority, unknown impact, new dependencies, failed invariants or an
  exhausted budget. No production restart authority is supplied by this packet.

## Acceptance and cold resume

Preparation receipt (2026-10-18): the FBF gate initially found no blocking bug
in this subsystem; after adding OP-BUG-010 it correctly blocks feature work.
`node scripts/test-operium-backlog.js` passed (21 items, one open bug).
Strict-role frontmatter verification passed for this packet and the corrected
Cogentia doctrine; the shared instruction also passed. Both scoped Git diff
checks passed. The corpus instruction audit found two unrelated existing gaps:
`barons-Mariani/projects/capable/AGENTS.md` lacks the explicit shared reference,
and `suicide-corse/AGENTS.md` is missing. They were not changed in this task.
No live probe, production mutation, commit, push or issue update was performed
as part of this preparation. Publication is still required before the new
canonical packet URL can serve a cold remote handler.

The implementer must exercise refused connect, silent/stalled listener, malformed
RFB banner, successful local protocol but broken proxy, successful restart with
failed postcondition, unknown client impact, and baseline drift. Use deterministic
fixtures first; do not test failure injection on production. Demonstrate that
unauthorized recovery makes no mutation and that retries cannot exceed the budget.

Resume from this packet and the parent issue: fetch current source, run the FBF
gate, discover the permitted observation route, identify deployed source, and
prepare the smallest patch. Only after the separate authority and impact gates
may the handler execute recovery. Return exact commits, checks, attempted effects,
functional evidence and residual uncertainty. Keep OP-BUG-010 open until the
functional acceptance contract is evidenced; do not close it on documentation.
