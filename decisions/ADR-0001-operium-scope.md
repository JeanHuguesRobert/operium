---
document_role: source
document_kind: decision-record
visibility: public
license: CC BY-SA 4.0
affiliation: Institut Mariani / C.O.R.S.I.C.A., 1 cours Paoli, F-20250 Corte, Corsica
language: en
date: '2026-09-15'
update_policy: UP-DEFAULT-REVIEWED
status: working-paper
review:
  status: unreviewed
  reviewed_by: []
provenance:
  origin_type: unknown
  origin_repository: unknown
  origin_ref: unknown
  origin_date: unknown
  derived_from: []
---


# ADR-0001 — Operium scope

## Status

Accepted.

## Context

Operational environments tend to become opaque over time.

Machines, repositories, services, domains, credentials, costs, backups, agents, scripts and dependencies evolve faster than their documentation.

This creates fragility, hidden coupling, operational debt and loss of autonomy.

## Decision

Operium will document operational environments as versioned registries.

The initial scope includes:

- current state;
- intended evolutions;
- operational health;
- risks;
- incidents;
- dependencies;
- architectural and operational decisions.

Operium will start with Markdown and YAML.

Automation, dashboards and AI assistance will be added later only when justified.

## Consequences

- The source of truth remains human-readable.
- The registry can be reviewed, versioned and forked.
- Sensitive data must be separated from public views.
- Operia remains an assistant layer, not a separate repository.
