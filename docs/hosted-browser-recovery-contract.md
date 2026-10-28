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
No live probe or production mutation was performed as part of that initial
preparation. The packet was subsequently published in `4d4d703`; the dated
receipt below supersedes the initial observation limitations.

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

## Resumption receipt — 2026-10-18, 16:17 UTC onward

Source baseline: `22695ffa54d31b440c3e433c3d075617b88a8aa5` on Operium main.
The existing main checkout was refreshed with `rebase --autostash`; the unrelated
simulator document edit and primary WIP branch were preserved. The FBF list
reported OP-BUG-010 open/high and the feature gate remained blocked.

`npm run test:hosted-browser-health` passed on that baseline with Node `v24.5.0`
and again after the scoped corrections below (exit 0, all three suites reported
passed). `git diff --check` passed. The added regression cases cover missing or
invalid client counts, unknown HTTPS evidence, slow partial RFB traffic and a
silent TLS handshake. This is an actual repository execution receipt, not an
inference from reviewing tests.

Corrections: a missing/invalid client count formerly passed the recovery guard
when `impact_known` was true; unknown HTTPS evidence also passed. Both now refuse
eligibility. Socket inactivity timeouts could renew under partial traffic; probes
now enforce an absolute deadline and cap the RFB banner buffer at 12 bytes.
Prevention: test incomplete evidence and traffic that progresses without completing
the protocol. The recovery helper remains pure; no executor or restart was added.

Native SSH read-only inspection and in-memory execution of the repository probe
functions produced the following bounded observations. No remote file was written,
no credentials used, and no service configuration changed:

| Surface | Actual observation | Limit |
| --- | --- | --- |
| fracta2 units | Parent browser and RFB units active | Activity is not usability |
| fracta2 RFB :5911 | Accept queue 33/32; 14 established TCP connections; local banner probe timed out at 3000 ms | TCP connections do not establish authenticated clients or accepted interruption |
| fracta RFB proxy | Socket ports 5900/5901; service active; probe through local :5900 timed out at 3000 ms | Public remote-client path and :5901 not tested |
| fracta2 HTTPS :8444 | HTTP 401, local self-signed certificate allowed explicitly | Listener only; no authenticated session |
| Public HTTPS | `https://browser.fractavolta.com` returned 401 with TLS validation enabled | Listener only; original transient HTTPS cause still unknown |

Deployed identity evidence (SHA-256):

| Artifact | Deployed digest | Reconciliation |
| --- | --- | --- |
| RFB unit | `32f191cc689892ca52d6347b5ed64d89a3747699490fbe0e4a6abaa39ee7f8ef` | Matches main template |
| Parent unit | `fe720858839802b387558d929d4f686d70cf3f46b20182983432f5c5b0d067f8` | Differs from main template |
| RFB startup script | `02956cb057cf35948327746cc6150a8f56259f87d3033303fae16581fdfdd860` | Differs from main template |
| Parent startup script | `75f6e4d28c0806b753ba64d3c05652d38d4e3e55d17ef17c6d979ed2b58a02c1` | Differs from main template |
| Listener health script | `2ec852a15ca0cf8062c72f37ed78553346f239ae2779727399df62e660b52a9a` | Exact match to `6076f0b:templates/hosted-browser/check-hosted-browser-health.sh` |

The deployed health script accepts HTTP 200/401/403; otherwise it restarts the
parent browser unit without a functional postcondition. It was read, never run.
RFB unit activation was dated 2026-10-16 03:47:36 UTC. File hashes establish
current on-disk identity, not that a running process loaded those exact bytes.

Remaining gates: `BLOCKED_ON_AUTHORITY` for any production restart/deployment;
client-session impact remains unverified. Local RFB fails before authentication,
so authenticated framebuffer usability cannot be established on that path now.
Do not request or disclose credentials to bypass this failure. Refresh live state
and impact immediately before any separately authorized action. Reconcile the
three differing deployed artifacts before selecting a deployment patch; retain
the parent browser/session, perform at most one RFB-only recovery, and verify
all contractual postconditions. No recovery, deployment or end-to-end success is
claimed. OP-BUG-010 and Cogentia #263 remain open.

## Authorized recovery follow-up — 2026-10-18, 21:20 UTC

The Principal authorized the necessary recovery in the resumed session. Before
acting, the handler refreshed the target state: RFB PID `531135`, parent browser
PID `531041`, both active; the RFB accept queue remained `33/32` with 14
established TCP connections. RFB unit and startup script hashes still matched
the previously recorded values. The parent browser PID remained stable. The
local RFB banner timed out while local HTTPS returned `401`. Impact was treated
as an accepted RFB client disconnect within the Principal's explicit mandate;
those TCP connections alone did not establish authenticated user sessions.

The direct gateway attempt first failed because `ssh` was absent from its shell.
The subsequent execution used the existing Operium route through the workstation
gateway and native SSH to fracta2, then used `sudo -n` for exactly one restart of
`hosted-browser-rfb@hosted-jeanhuguesrobert.service`. The gateway request timed
out without returning a receipt, so the effect was verified independently:
systemd's journal records the exact sudo command at `2026-10-18 21:20:47 UTC`,
the unit's main PID changed to `753710`, and `ActiveEnterTimestamp` advanced to
that time. The parent browser PID stayed `531041` and its activation time did
not change. `NRestarts=0`; this was one explicit restart, not an automatic retry.

After the restart, the RFB listener had an empty accept queue. The protocol-only
banner probes returned `responsive` for fracta2 `127.0.0.1:5911` and the fracta
loopback relay `127.0.0.1:5900`. Local HTTPS on `8444` and public HTTPS at
`browser.fractavolta.com:443` both returned `401` (the public probe validated
TLS). Thus the protocol and listener postconditions passed, and the parent
browser process remained active.

Authenticated VNC validation did not pass: the server rejected the bounded
authentication handshake. No framebuffer pixels were retained or emitted.
Authenticated framebuffer usability is **UNVERIFIED**, so no end-to-end
recovery or bug closure is claimed. The single-restart budget is spent. Do not
retry or change credentials in this continuation. The next action is to inspect
the authorized credential provisioning path and deployed RFB process arguments,
prepare a minimal credential correction, and obtain a fresh explicit mandate
before any further production mutation. OP-BUG-010 and Cogentia #263 stay open.
