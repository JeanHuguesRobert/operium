---
title: Documentation
author: unknown
date: '2026-07-12'
document_role: source
document_kind: documentation
visibility: public
lifecycle_state: working
update_policy: UP-DEFAULT-REVIEWED
provenance:
  origin_type: repository
  origin_repository: JeanHuguesRobert/operium
  origin_ref: f603276
  origin_date: '2026-07-12'
  derived_from: []
review:
  status: unreviewed
  reviewed_by: []
---

# Documentation

This directory contains Operium documentation.

- [Cogentia Semantic Stack](cogentia-semantic-stack.md)
- [Fracta trust perimeter and secrets](fracta-trust-perimeter.md)
- [Secret-safe inspection protocol](fracta-trust-perimeter.md#secret-safe-inspection-protocol)
- [Fractanet mesh — Tailscale and SSH](fractanet-mesh.md)
- [Edge trap-directed polling (SNMP pattern)](../cogentia/docs/edge-trap-directed-polling.md) — Pi 3 store-and-forward + fracta manager
- [fractavolta.com DNS zone](fractavolta-dns.md)
- [Operium CLI](operium-cli.md)
- [Operium Node Agent (ONA)](operium-node-agent.md)
- [Cogentia Agent Indexing Roadmap](cogentia-agent-indexing-roadmap.md)
- [Workstation tooling debt and tool profiles](workstation-tooling-debt-and-profiles.md) — admin-install debt, user-space policy, PC vs fracta

Operational scripts:

- `scripts/ops/ensure-fractanet-rsync.ps1` — install or verify `rsync` on the
  Fractanet node set through Tailscale SSH aliases.
- `scripts/ops/ensure-supabase-cli.ps1` — Scoop user-space Supabase CLI (no admin).
- `profiles/tools.workstation-windows.v1.yaml` / `profiles/tools.fracta-vps.v1.yaml` — desired tooling.
