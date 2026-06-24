# Operia

**Operia** is the future AI-assisted layer of Operium.

Operium is the registry.  
Operia helps read, maintain, diagnose and evolve the registry.

Operia is not a separate project yet.

## Intended functions

Operia may later help to:

- read an Operium registry;
- detect missing fields, contradictions and stale data;
- suggest evolutions;
- summarize operational health;
- generate public views from private registries;
- prepare dashboards;
- assist maintenance without becoming the source of truth.

## Boundary

Operia must not replace the registry.

The registry remains Markdown and YAML first. Operia is an assistant layer, not an authority.

## Repository decision

No separate `operia` repository is justified at this stage.

Operia should remain documented inside Operium until it becomes an autonomous application, CLI, package or service.
