---
title: Stalwart templates (secret-free)
author: Jean Hugues Noël Robert, baron Mariani
affiliation: Institut Mariani / C.O.R.S.I.C.A., 1 cours Paoli, F-20250 Corte, Corsica
date: '2026-09-15'
last_modified_at: '2026-09-15'
version: '0.1'
status: working-paper
license: CC BY-SA 4.0
language: en
document_role: template
update_policy: UP-DEFAULT-REVIEWED
provenance:
  origin_type: repository
  origin_repository: unknown
  origin_ref: unknown
  origin_date: '2026-09-15'
  derived_from: []
review:
  status: unreviewed
  reviewed_by: []
---

# Stalwart templates (secret-free)

Fragments and examples for the private Stalwart install on `fracta`.

| File | Purpose |
|------|---------|
| `Caddyfile.mail.fragment` | Public HTTPS reverse-proxy for JMAP; admin paths blocked |
| `stalwart.env.example` | Environment file shape (`STALWART_PUBLIC_URL`, recovery comments) |
| `accounts-plan.ndjson.example` | Declarative domain + phase1 accounts (replace secrets) |
| `stalwart-backup.service` / `.timer` | Daily encrypted backup unit |
| `stalwart-cert-sync.service` / `.timer` | Sync Caddy's renewed public certificate into Stalwart |
| `logrotate-stalwart` | Log retention without unbounded growth |

Operational runbook: [`docs/stalwart-private-mail.md`](../../docs/stalwart-private-mail.md).

**Never** commit real passwords, recovery admin strings, backup keys, or private keys here.
