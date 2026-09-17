---
title: Fracta2 GitHub account SSH and static release procedure
description: Secret-safe operating procedure for Fracta2 GitHub authentication and atomic promotion of a generated static release.
layout: default
nav_order: 17
date: '2026-09-18'
last_modified_at: '2026-09-18'
license: CC BY-SA 4.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/fracta2-github-static-release.md
document_role: operational
document_kind: runbook
visibility: public
lifecycle_state: active
author: Jean Hugues Noël Robert, baron Mariani
update_policy: UP-DEFAULT-REVIEWED
classification_source: cogentia.js
classification_version: '1'
classification_rule: explicit-metadata
classification_confidence: high
affiliation: Institut Mariani / C.O.R.S.I.C.A., 1 cours Paoli, F-20250 Corte, Corsica
language: en
status: working-paper
review:
  status: unreviewed
  reviewed_by: []
provenance:
  origin_type: operational-observation
  origin_repository: JeanHuguesRobert/operium
  origin_ref: suicide-corse-preview-2026-09-18
  origin_date: '2026-09-18'
  derived_from: []
---

# Fracta2 GitHub Account SSH and Static Release Procedure

## Why this is a node-local runbook

This document belongs to `fracta2` because it records a capability and a
recovery path that must be executable from that node. It follows the Corpus
locality principle: heavy state stays near where it is used, small mandates and
procedures travel, weak nodes may subcontract, and only the necessary slice
ascends to a broader layer.

Node-local documentation is therefore a scalable projection, not a separate
authority. The durable operational record remains Git plus applicable COP
events; a node's local configuration and runtime cache are evidence to inspect,
not a substitute for that record. A distributed continuation remains resumable
only when its dependencies are embedded, stably referenced, or verifiably
materializable.

## Scope and security boundary

`fracta2` has a dedicated SSH authentication key registered on the GitHub
account of the human principal. It inherits that account's repository access;
it is not a repository-scoped deploy key.

This is intentional operational capacity, not a substitute for human
authorization. GitHub access does not authorize a commit, push, deployment, or
publication. Each external effect remains subject to the applicable mandate.

The private key, its filesystem content, and any unrelated credentials are
never copied into this repository, logs, tickets, or public artifacts. The
public key and fingerprint are also omitted here because they are operational
identifiers rather than material needed to operate this procedure.

## Configuration invariants

- The key has a dedicated, descriptive name under the service user's
  `~/.ssh/` directory and restrictive permissions.
- `~/.ssh/config` selects that key for `github.com` with `IdentitiesOnly yes`.
- GitHub's host key is added only after its fingerprint has been verified
  against GitHub's published fingerprint.
- A checkout that needs write access uses an SSH remote such as
  `git@github.com:OWNER/REPOSITORY.git`, not an HTTPS URL requiring an
  interactive credential.
- One account-level key is a broad authority: if Fracta2 is compromised, revoke
  the key in the principal's GitHub account immediately, investigate the host,
  and create a replacement key only under fresh human authorization.

## Read-only verification

Run these checks as the service user. The first command deliberately returns a
non-zero exit code after successful authentication because GitHub offers no
shell session.

```bash
ssh -T git@github.com
git -C /path/to/checkout ls-remote origin HEAD
git -C /path/to/checkout status --short --branch
```

The authentication response must name the expected GitHub account. Do not
infer authorization from an SSH success, and do not treat a stale remote
tracking branch as proof that a push failed: use `git fetch origin --prune`
before comparing the checkout with its upstream.

## Atomic static-release promotion

This procedure applies when a generated artifact repository is rendered on
Fracta2 and served by a root-owned static directory.

1. Confirm the source commit, artifact commit, publication status, and expected
   output files. A rendered artifact must be committed and pushed before it is
   promoted.
2. Create a uniquely named staging directory under the release directory with
   `sudo -n mkdir`. A normal user cannot create it when the release directory
   is root-owned.
3. Export the exact artifact commit into that staging directory. Validate the
   staged manifest and the final HTML/PDF/EPUB bytes before promotion.
4. Move the validated staging directory to its immutable release name.
5. Replace the `current` symlink atomically through a temporary sibling
   symlink. Keep the former release directory so that rollback remains a
   separate, observable action.
6. Verify the public HTTPS endpoint independently of the host-side checks,
   including response status, content type, manifest source commit, publication
   status, and any explicitly required public content.

Never mutate a serving release in place. A failed stage must not change
`current`; a successful promotion does not rewrite the prior release.

## COP practice gap ledger (observed 2026-09-18)

The target architecture is a cross-domain control layer: local sources and
capabilities remain situated, while COP envelopes preserve routing,
provenance, authority context, correlations, and receipts across a workflow.
The following observations distinguish that target from current practice.

| Area | Observed capability | Unresolved gap |
|---|---|---|
| Node-local control | ONA was active on `fracta2`; Fracta and Fracta2 advertised fresh `operium.node.v1` attractors. | The observer catalogue listed no active nodes while the mesh and blackboard did: catalogue and live views need explicit reconciliation. |
| COP envelope handling | Local COP tests covered status, query, wake, event, snapshot, outbox delivery, HTTP routing, and resolve authorization. | This is implementation and local/integration evidence, not a business-level, cross-domain effect trace. |
| Blackboard routing | Attractors advertise capability and availability. | The Guide still uses static backend resolution; blackboard-aware Phase 2 routing remains specified, not implemented. |
| Declared packet types | `cop/node.probe.v1` and `cop/node.consolidate.v1` are declared. | Their handler intentionally returns `not_implemented_v1` pending Phase 3. |
| Static publication | Source commit, artifact commit, release, manifest, hashes, and public HTTPS can be verified manually. | No deployment/effect-receipt COP implementation was found in the inspected Operium runtime code, schemas, or scripts. |

An observer session without rights to its local Tailscale control API may report
the mesh and aggregator unreachable. This is an observer-access condition, not
by itself evidence that the remote service is down; repeat the probe with the
required local permission before recording an outage.

## Proposed continuations

These are prepared continuation candidates, not mandates, schedules, or
authorized actions. They must be materialized in an appropriate issue or COP
object, then resolved only by a handler with the required mandate.

### `operium-cop-catalogue-reconciliation`

- **Classification:** judgment boundary.
- **Question:** which durable registry source is authoritative for node
  membership, and how should catalogue entries, live mesh observations, and
  blackboard attractors be reconciled without treating any cache as truth?
- **Prepared next action:** compare the canonical registry with the live
  observations and propose a one-way, reviewable reconciliation contract.
- **Resume condition:** the principal selects the authoritative membership
  source and permits a scoped registry/documentation change.
- **Expected result:** a contract naming authority, freshness, drift classes,
  and a non-destructive correction procedure.

### `operium-cop-phase2-routing`

- **Classification:** architecture and implementation judgment boundary.
- **Question:** under what policy may the Guide select an online
  `operium.node.v1` attractor rather than its static backend?
- **Prepared next action:** define the smallest read-only selection experiment,
  its trust boundary, fallback behavior, and acceptance evidence.
- **Resume condition:** an explicit engineering mandate and a bounded test
  target are supplied.
- **Expected result:** a testable routing contract; no production routing
  change is implied.

### `operium-cop-phase3-packets`

- **Classification:** implementation gap.
- **Question:** what precise semantics, authorization checks, idempotency, and
  receipts are required before `cop/node.probe.v1` and
  `cop/node.consolidate.v1` stop returning `not_implemented_v1`?
- **Prepared next action:** derive acceptance tests from the existing envelope,
  outbox, and authorization conventions.
- **Resume condition:** explicit scope for the packet types and their effects.
- **Expected result:** schemas, handler contract, tests, and an effect boundary
  suitable for human review.

### `operium-cop-deployment-receipt`

- **Classification:** cross-domain traceability gap.
- **Question:** how can a deployment produce a COP receipt correlating source
  commit, artifact commit, renderer, immutable release, public verification,
  rollback predecessor, and publication status without exposing secrets?
- **Prepared next action:** design a minimal `effect_intent` / `effect_receipt`
  pair and a fixture based on the verified static-release procedure.
- **Resume condition:** explicit authorization to design or implement the
  receipt schema and its storage/routing boundary.
- **Expected result:** a secret-safe, replayable receipt contract; it must not
  make publication automatic or replace human publication authority.

## Observed application of the procedure

On 2026-09-18, the `Suicide Corse` preview release was promoted from artifact
commit `261f459308ce2e578c41c42e6304df33741ef1ae` into release
`2026-09-17-81945d1`. Its manifest identified source commit
`81945d1c378cd2351688dec626f80385c2eac24c` and retained
`publication_status: draft`.

The observation establishes that the procedure worked for that release. It
does not establish a final editorial status or authorize reuse for another
publication.

