# Operational health

Operium tracks operational health before it tries to automate monitoring.

The goal is to make fragility visible, discussable and actionable.

## Minimal health scale

| Score | Meaning |
|---:|---|
| 0 | Unknown |
| 1 | Broken |
| 2 | Fragile |
| 3 | Functional |
| 4 | Robust |
| 5 | Reproducible, documented and monitored |

## Health record

Example:

```yaml
health:
  score: 2
  status: fragile
  reasons:
    - "Depends on a single local machine."
    - "Backup policy is not verified."
  next_actions:
    - "Document repositories."
    - "Verify backups."
    - "Create a minimal recovery procedure."
```

## What to track

An Operium registry may track health for:

- hosts;
- repositories;
- services;
- domains;
- backups;
- agents;
- data flows;
- deployments;
- scripts;
- dependencies.

## Principle

A low health score is not a failure.

It is a visible operational fact that can be stabilized.
