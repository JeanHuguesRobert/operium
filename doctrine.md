---
document_role: "source"
document_kind: "doctrine"
visibility: "public"
---

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

## Fix Bugs First (when out of control)

When the operational plane or a product surface becomes hard to steer, **do not
add features first**. Restore control with a **Bug/Feature tracking system**:

- typed items (`bug` vs `feature` vs `incident`);
- subsystem scope;
- severity and evidence for bugs;
- a **gate**: known high/critical bugs block new features in the same subsystem
  unless waived in the register.

The versioned register is `backlog/items.yaml`. Method:
[`docs/fix-bugs-first.md`](docs/fix-bugs-first.md). CLI: `operium backlog list|gate`.

## Design constraints

Operium should remain:

- human-readable;
- versioned;
- auditable;
- usable before automation;
- compatible with public/private separation;
- extensible toward scripts, dashboards and AI assistance.
