# Operium

**Operium** is a versioned operational environment registry.

It documents:

1. the current operational state;
2. intended evolutions;
3. operational health;
4. risks, dependencies and incidents;
5. architectural and operational decisions.

Operium is designed for individuals, small organizations, open-source projects and autonomous operational environments.

## Core idea

An undocumented operational environment is progressively captured by habit, urgency and oblivion.

Operium makes operational reality visible, versioned, discussable and auditable.

## Structure

```text
schema/       Generic YAML schemas
templates/    Reusable templates
examples/     Example operational registries
docs/         Method, doctrine and security notes
decisions/    Architecture Decision Records
```

## Operia

Operia is the future AI-assisted layer of Operium.

Operium is the registry.
Operia helps read, maintain, diagnose and evolve the registry.

Operia is not a separate project yet.

## Status

Early design stage.

## License

Apache-2.0


## Doctrine

Operium applies a simple rule to operational environments:

> Make the current state visible.  
> Make intended evolutions explicit.  
> Make operational health verifiable.

An Operium registry should distinguish:

1. facts;
2. assumptions;
3. intended evolutions;
4. incidents;
5. risks;
6. decisions;
7. private data;
8. public views.

Operium is not a monitoring tool first.

It is a versioned operational memory that can later be connected to scripts, dashboards, probes, agents and AI assistants.

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
