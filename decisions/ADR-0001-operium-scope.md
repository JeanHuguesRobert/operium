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
