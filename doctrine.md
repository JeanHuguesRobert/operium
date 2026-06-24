# Operium Doctrine

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

## Position

Operium is not a monitoring tool first.

It is a versioned operational memory that can later be connected to scripts, dashboards, probes, agents and AI assistants.

## Minimal method

An Operium registry should answer three operational questions:

1. What exists now?
2. What changes are intended, active, blocked or abandoned?
3. How healthy, fragile or reproducible is the operational environment?

## Design constraints

Operium should remain:

- human-readable;
- versioned;
- auditable;
- usable before automation;
- compatible with public/private separation;
- extensible toward scripts, dashboards and AI assistance.
