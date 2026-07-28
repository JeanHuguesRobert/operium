---
title: "Portable automation: Node now, Inox progressively"
description: "Corpus-wide decision proposal for portable automation using Node.js ESM as the current host layer and Inox as the progressive language destination."
author: "Jean Hugues Noël Robert, baron Mariani"
affiliation: "Institut Mariani / C.O.R.S.I.C.A., 1 cours Paoli, F-20250 Corte, Corsica"
date: "2026-07-27"
last_modified_at: "2026-07-28"
license: "CC BY-SA 4.0"
language: "en"
canonical_url: "https://github.com/JeanHuguesRobert/operium/blob/main/docs/portable-automation-node-inox.md"
last_stamped_at: "unknown"
status: "draft — corpus-wide direction proposal awaiting human review"
ai_assisted_by:
  - "OpenAI Codex (research, drafting, and structuring)"
document_role: "source"
document_kind: "decision-proposal"
visibility: "public"
lifecycle_state: "draft"
related_documents:
  - "Inox/research/two-versions-scripting-vs-system.md"
  - "Inox/research/js-interop-api-for-scripting-layer.md"
  - "Inox/research/fractanet_language_abstractions.md"
  - "operium/docs/workstation-tooling-debt-and-profiles.md"
provenance:
  origin_type: "conversation"
  origin_repository: "unknown"
  origin_ref: "unknown"
  origin_date: "2026-07-27"
  derived_from:
    - "User direction recorded in the working conversation"
    - "Inox/research/two-versions-scripting-vs-system.md"
    - "Inox/research/js-interop-api-for-scripting-layer.md"
    - "Inox/research/fractanet_language_abstractions.md"
review:
  status: "unreviewed"
  reviewed_by: []
update_policy: "UP-DEFAULT-REVIEWED"
---

# Portable automation: Node now, Inox progressively

## Status

This is a corpus-wide direction proposal, not a claim about current state.
Operium owns the fleet automation policy and implementation profile. Inox owns
the language destination and its semantics.

## Decision

Use this preference order for new or substantially revised automation:

1. Inox `.nox` when the default CLI/scripting dialect already supports the task
   reliably.
2. Node.js ESM in pure JavaScript as the portable implementation and host layer.
3. Classical Unix tools when they make a task materially simpler and their
   availability is explicit.
4. A thin operating-system-specific shim where service managers, installers,
   elevation, or platform APIs require one.
5. Python, TypeScript, PowerShell, or shell as an exception with a recorded
   reason, not as an agent default.

This is not a ban on foreign ecosystems. A maintained Python package, system
utility, or native tool may remain the right adapter. The corpus should avoid
creating new Python glue merely because a coding agent finds Python convenient.

## Architectural direction

```text
today
  OS-specific shell and Python glue
    -> portable Node ESM command
    -> Inox .nox orchestration using the JS/npm bridge
    -> native Inox capability or dialect when recurring and justified

stable exceptions
  systemd / Task Scheduler / package manager / specialist foreign package
    -> thin adapter invoked by Node or Inox
```

Node is the bootstrap substrate, portable host, and npm ecosystem bridge. It is
not the long-term language center. Inox is intended to become that center.

The existing Inox default CLI path already expresses this direction:

- `bin/inox.js` is an ESM launcher;
- `lib/cli-stdlib.nox` provides the agent-obvious scripting surface;
- `js.*` exposes the underlying JavaScript VM and npm ecosystem deliberately;
- the l9/COP system layer remains opt-in and should not block ordinary scripts.

## Language policy

### Node.js

- Runtime baseline: Node `>=22.13`; prefer the corpus-pinned recent version.
- Modules: ESM.
- Source: pure JavaScript; no TypeScript for operations automation.
- Prefer Node built-ins (`node:fs`, `node:path`, `node:child_process`, `fetch`,
  `node:test`) before dependencies.
- Add small, maintained packages only when they remove real portability or
  correctness work.
- Invoke processes with argument arrays. Do not construct shell command strings
  for ordinary execution.
- Every mutating command should support dry-run or an inspectable plan where
  practical, structured results, bounded timeouts, and secret-safe diagnostics.

### Inox

- Target the default CLI/scripting dialect first, not the unstable full l9 path.
- Keep orchestration and policy in `.nox`; reach Node/npm through explicit
  `js.*` adapters for missing capabilities.
- Promote repeated adapters into named Inox words or dialect capabilities.
- Move a task only after the required words, error behavior, tests, and
  cross-platform execution are adequate.
- Do not rewrite stable Node code into Inox merely to improve language counts.

### Python

New Python automation is disallowed by default. It needs a concrete exception,
such as a uniquely suitable scientific, AI, hardware, or vendor package. Even
then, expose it through a narrow Node/Inox adapter and keep corpus policy outside
the Python component.

### Shell and operating-system shims

Classical Unix tools are acceptable when declared as host capabilities.
PowerShell, `cmd`, and shell files should normally be one of:

- a one-line launcher into Node or Inox;
- an elevated installer;
- a service-manager adapter;
- a small compatibility boundary that is tested on its target OS.

They should not contain the portable business or orchestration logic.

## Migration plan and estimate

### Phase 0 - policy and inventory (1-2 days)

- Approve this decision.
- Add the preference order to corpus agent guidance.
- Generate a reproducible inventory by repository, language, purpose, churn,
  platform coupling, and owner.
- Classify each script: keep adapter, wrap, port to Node, candidate for Inox, or
  retire.

Deliverable: inventory plus a ranked migration backlog. No mass rewrite.

### Phase 1 - portable Node foundation (2-4 days)

- Establish a small Operium ops kit for process execution, paths, atomic writes,
  environment-file reads, SSH, dry-run plans, and structured diagnostics.
- Prefer built-ins; evaluate `execa` only if the thin spawn helper becomes
  materially complex.
- Add `node:test` coverage on Windows and Linux.

Deliverable: one tested implementation profile, not a general-purpose framework.

### Phase 2 - high-pain Operium surface (5-10 days)

Port the scripts that currently duplicate PowerShell/bash logic or repeatedly
fail on Windows. Start with mesh apply and workstation tooling. Leave service
registration as thin platform adapters.

Deliverable: the same Node command runs on workstation, ThinkPad, and Linux
nodes, with platform adapters selected internally.

### Phase 3 - corpus rule and migration on contact (2-4 days initially)

- Replace dual `.bat`/`.ps1` launchers with a single Node/Inox command plus the
  minimum `.cmd` convenience shim.
- Require a reason for new Python, TypeScript, PowerShell, or shell automation.
- When an existing script is materially changed, port or wrap it if the change
  is low risk. Do not block unrelated fixes on a large rewrite.

Deliverable: shell and Python counts stop growing; high-churn paths shrink.

### Phase 4 - Inox pilot (3-7 days)

Choose two bounded tools:

1. a read-only inventory or status command;
2. a dry-run desired-state planner with no privileged mutation.

For each pilot:

- list missing `cli-stdlib` words;
- implement or bridge them explicitly;
- compare output and exit behavior against the Node reference;
- test on Windows and Linux;
- retain the Node implementation as the oracle until parity is stable.

Deliverable: evidence about the real cost of moving orchestration from Node to
Inox, plus a prioritized CLI-dialect backlog.

### Phase 5 - progressive Inox absorption (ongoing)

Move recurring, stable orchestration into `.nox` when the pilot gates are met.
Keep Node as the host and escape hatch. Promote recurring foreign operations
through the path:

```text
foreign package -> JS adapter -> Inox word -> dialect capability -> native
primitive only when justified
```

### Effort range

| Outcome | Estimated effort |
|---|---:|
| Policy, inventory, Node foundation | 1-2 weeks |
| Portable day-to-day Operium automation | 2-4 person-weeks total |
| First credible Inox automation pilots | add 1-2 weeks |
| Corpus-wide migration | opportunistic and ongoing |

The Inox estimate has wider uncertainty than the Node estimate. The default CLI
path exists, but some higher map/update helpers and full bootstrap behavior are
still documented as fragile. Pilots should determine the actual cost before a
calendar commitment is made.

## Acceptance criteria

The first migration wave is complete when:

- one command and argument model works on supported Windows and Linux nodes;
- portable orchestration contains no new Python, TypeScript, PowerShell, or bash;
- OS-specific files are thin and have a named reason to exist;
- dry-run, timeout, exit status, JSON output, and secret redaction are tested;
- the inventory reports no growth in exception-language automation;
- two Inox pilots have parity evidence or a precise blocker list;
- the Node implementation remains available until each Inox replacement is
  observably equivalent.

## Risks and controls

| Risk | Control |
|---|---|
| Node becomes a new permanent center | Track Inox candidates and run bounded pilots |
| Premature Inox rewrite | Require parity gates and keep the Node oracle |
| Agent reintroduces Python | Corpus guidance plus exception reason in review |
| A large "ops kit" becomes a framework | Add helpers only after a second real use |
| Unix-tool use silently breaks Windows | Declare capability and supply a Node fallback |
| Platform shims regain business logic | Test the portable core independently |

## Immediate next batch

1. Human decision on this proposal.
2. Build the script inventory as a Node ESM command under Operium.
3. Use that inventory to select the first three Node ports and two Inox pilots.
4. Add the approved rule to corpus-facing agent guidance.
