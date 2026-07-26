---
title: "ADR — Fix Bugs First via versioned Bug/Feature backlog"
date: "2026-07-26"
document_role: decision
document_kind: adr
visibility: public
lifecycle_state: accepted
status: accepted
---

# ADR — Fix Bugs First via versioned Bug/Feature backlog

## Context

Operium’s surface grew (CLI, ONA, secrets dual authority, mesh, console).
Interactive development was inventing features while known operational loops
remained broken or flaky. Issue lists existed but lacked kind, subsystem,
severity, and a mechanical feature gate.

An older operator doctrine applies when projects get out of control: **Fix Bugs
First** — which is not a slogan but a **Bug/Feature tracking system**.

## Decision

1. Operium maintains a versioned register at **`backlog/items.yaml`** (authority
   for triage and gate).
2. Doctrine and method live in **`docs/fix-bugs-first.md`**.
3. CLI exposes **`operium backlog list`** and **`operium backlog gate
   --subsystem <slug>`**.
4. Open bugs with severity **`critical` or `high`** (without active waiver)
   **block new feature work** in that subsystem.
5. GitHub Issues are the **discussion mirror** (labels `bug`/`enhancement`,
   `severity:*`, `subsystem:*`, `fbf`); they do not replace the YAML register.

## Consequences

- Agents and humans start ops sessions with `backlog list` / `gate`.
- Feature issues (e.g. map apply polish) wait on gateway/secrets bugs when
  gates fail.
- Waivers must be explicit (`reason`, optional `expires_at`) in the register.

## Related

- [`docs/fix-bugs-first.md`](../docs/fix-bugs-first.md)
- [`backlog/README.md`](../backlog/README.md)
- [`doctrine.md`](../doctrine.md)
