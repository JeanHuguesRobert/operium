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

## Start here

- [`doctrine.md`](doctrine.md) defines the core principles.
- [`docs/public-private-split.md`](docs/public-private-split.md) explains how to separate public views from private operational data.
- [`docs/operational-health.md`](docs/operational-health.md) defines the first health model.
- [`docs/cogentia-semantic-stack.md`](docs/cogentia-semantic-stack.md) defines the local and Fracta profile for Cogentia semantic retrieval.
- [`docs/fracta-trust-perimeter.md`](docs/fracta-trust-perimeter.md) defines fracta SSH access, the trust boundary, `guide.env` secrets (never GitHub), and Inox retrieval routing.
- [`docs/cogentia-agent-indexing-roadmap.md`](docs/cogentia-agent-indexing-roadmap.md) defines the agile roadmap for stable indexes, branch overlays and agent-facing retrieval.
- [`docs/operia.md`](docs/operia.md) defines the future AI-assisted layer.
- [`decisions/ADR-0001-operium-scope.md`](decisions/ADR-0001-operium-scope.md) records the initial scope decision.

## Operia

**Operia** is the future AI-assisted layer of Operium.

Operium is the registry.  
Operia helps read, maintain, diagnose and evolve the registry.

Operia is not a separate project yet.

## Status

Early design stage.

## License

Apache-2.0
