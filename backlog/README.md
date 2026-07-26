---
title: "Operium backlog (Bug/Feature register)"
date: "2026-07-26"
document_role: operational
document_kind: method
visibility: public
lifecycle_state: active
---

# Operium backlog

Versioned **Bug/Feature register** for Fix Bugs First.

- **Doctrine:** [`docs/fix-bugs-first.md`](../docs/fix-bugs-first.md)
- **Authority file:** [`items.yaml`](items.yaml)
- **CLI:** `operium backlog list|gate` (from repo root or `PATH`)

## Item shape

```yaml
- id: OP-BUG-001                 # OP-BUG-|OP-FEAT-|OP-INC-|OP-DEBT- + number
  kind: bug                      # bug | feature | incident | debt
  title: Short imperative title
  subsystem: secrets             # stable slug
  severity: high                 # bugs/incidents: critical|high|medium|low
  priority: p1                   # features: p0|p1|p2|p3 (optional)
  status: open                   # open | in_progress | blocked | deferred | done
  evidence: How we know (probe, log, date)
  next_action: Concrete next step
  github_issue: 12               # optional
  blocks_features: true          # default true for bug severity high|critical
  waiver:                        # optional; lifts gate while valid
    reason: "..."
    owner: "jhr"
    expires_at: "2026-08-01"
  opened_at: "2026-07-26"
  closed_at: null
  notes: |
    Free text.
```

## Subsystems (current)

| Slug | Surface |
|------|---------|
| `secrets` | Dual authority keys, vault, runtime copies |
| `magistral-routing` | Guide → Magistral → Agent Gateway |
| `agent-gateway` | ThinkPad/gateway listen, token, firewall |
| `mesh` | Tailscale / SSH fractanet |
| `ona` | Operium Node Agent |
| `console` | Operator console / dashboard |
| `cli` | `operium` CLI itself |
| `docs` | Registry docs / research drift |
| `tooling` | Workstation install profiles |
| `replication` | Corpus replication / graph |
| `meta` | Tracking hygiene, labels, process |

## Workflow

1. Add or edit an item in `items.yaml`.
2. Optionally open/update a GitHub issue; set `github_issue`.
3. Run `operium backlog gate --subsystem <slug>` before feature work.
4. Close with `status: done`, `closed_at`, and a one-line evidence note.
