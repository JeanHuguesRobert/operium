---
document_role: "operational"
document_kind: "documentation"
visibility: "public"
lifecycle_state: "active"
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "documentation"
classification_confidence: "medium"
---

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

## Fracta mobile diagnostic — observed 2026-10-10

The existing ONA service successfully ran the bounded #141 mobile diagnostic
and automatically delivered its receipt to GitHub. Status: operational for the
single admitted packet. ONA active; no automatic restarts observed after the
planned activation restart. Live repository edits and SSH trust were preserved.

Deployment: Operium `e1d26b4a29d2aa3c88628f9fb3ab3fc4383a6590` in an isolated
checkout; one script-job opt-in. The one-hour grant expires at 11:06:25.899 UTC
on 2026-10-10. Expiry prevents further work while retaining claims and receipts.
[Runbook, evidence and rollback](mobile-termux-diagnostic.md).
