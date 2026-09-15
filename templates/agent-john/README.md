---
title: Agent John (WhatsApp) templates
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

# Agent John (WhatsApp) templates

Secret-free fragments for Fracta (and similar hosts).

| File | Use |
|------|-----|
| `agent-john-whatsapp.retrieval.env.example` | Env key list for retrieval modes |
| `agent-john-whatsapp.service.d-retrieval.conf` | systemd drop-in for **shadow** pilot |
| `agent-john-whatsapp.accounting.conf.example` | COP durable spend (Supabase + spool) for WhatsApp unit |
| `mcp-cogentia.accounting.conf.example` | COP flags for Guide/MCP unit |
| `mcp-cogentia.service.d-guide-openrouter-free.conf.example` | Explicit, reversible free-model fallback for the public Guide |

Desired state and apply/verify steps:

- [`docs/agent-john-whatsapp-retrieval.md`](../../docs/agent-john-whatsapp-retrieval.md)

Product / pairing handbook (code repo):

- [cogentia `docs/agent-john-deployment-operium.md`](https://github.com/JeanHuguesRobert/cogentia/blob/main/docs/agent-john-deployment-operium.md)
