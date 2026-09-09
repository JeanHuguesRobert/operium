---
title: Templates
author: unknown
date: '2026-06-24'
document_role: source
document_kind: documentation
visibility: public
lifecycle_state: working
update_policy: UP-DEFAULT-REVIEWED
provenance:
  origin_type: repository
  origin_repository: JeanHuguesRobert/operium
  origin_ref: 137acf8
  origin_date: '2026-06-24'
  derived_from: []
review:
  status: unreviewed
  reviewed_by: []
---

# Templates

This directory contains starter files for Operium registries.

Initial templates should cover:

- hosts;
- repositories;
- services;
- domains;
- health records;
- evolutions;
- decisions.

Templates should remain simple, human-readable and usable before scripts or dashboards are introduced.

## Service fragments

- [`stalwart/`](stalwart/) — secret-free Caddy fragment, env example, and accounts plan for private Stalwart on fracta (see [`docs/stalwart-private-mail.md`](../docs/stalwart-private-mail.md)).
- [`hosted-browser/`](hosted-browser/) — KasmVNC + Chrome systemd units and an optional unpublished Caddy fragment (`Caddyfile.browser.fragment`). Provisioning is `scripts/ops/provision-hosted-browser-user.sh` ([`docs/hosted-browser-kasmvnc-cdp.md`](../docs/hosted-browser-kasmvnc-cdp.md)).
- [`agent-john/`](agent-john/) — WhatsApp retrieval env + systemd drop-in for shadow pilot (see [`docs/agent-john-whatsapp-retrieval.md`](../docs/agent-john-whatsapp-retrieval.md)).
