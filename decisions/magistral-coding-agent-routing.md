---
title: "ADR — Magistral routes Guide synthesis via coding-agent gateways"
date: "2026-07-26"
document_role: "source"
document_kind: adr
visibility: public
lifecycle_state: accepted
status: accepted
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "explicit-metadata"
classification_confidence: "strong"
legacy_document_role: "decision"
---

# ADR — Magistral routes Guide synthesis via coding-agent gateways

## Context

The public FractaVolta Guide needs conversational synthesis. Cloud OpenAI nodes
in Magistral’s map returned **401**, so Guide fell back to extractive answers.

Capable hosts already run an **Agent CLI Gateway** (OpenAI Chat Completions + SSE)
that drives coding agents the operator uses daily (Grok, Claude, Codex). That
gateway is advertised on the Fractanet blackboard
(`attractor:i7-thinkpad-jhr:agent-cli-gateway`).

**Operium** owns operational deployment state and desired routing. Application
repos (cogentia, inseme) supply code and unit fragments; they must not become a
second ops control plane.

## Decision

1. **Magistral** remains the loopback OpenAI-compatible router on fracta
   (`:8880`, `MAGISTRAL_ROUTER_ONLY=true`).
2. **Primary chat nodes** for tier `fast` are **Agent CLI Gateway** endpoints on
   trusted Tailscale hosts (not public Internet).
3. **Cloud OpenAI** nodes are demoted to tier **`fallback`** (optional).
4. **Guide** keeps `COGENTIA_GUIDE_AGENT_GATEWAY=0` so synthesis goes
   Guide → Cogentia daemon → Magistral → coding-agent gateway (stateless router).
   Client owns conversation history.
5. **Secrets** — the shared system bearer is **`COGENTIA_API_KEY` only**
   (do not also store the same secret as `AGENT_GATEWAY_TOKEN=`).
   - **Workstation FS authority:** `inseme/.env`
   - **Edge authority:** Supabase `instance_config` vault key `cogentia_api_key`
     (`is_secret=true`) — edge functions have no FS for `inseme/.env`; push with
     `sync-secrets.js --apply --vault`
   - **Runtime copies:** `/etc/cogentia/magistral.env`, tool-host
     `~/.cogentia/secrets/agent-gateway.env` (etc.)
   Legacy `AGENT_GATEWAY_*` names remain **code read aliases** only. Values
   never GitHub. Operium stores **names, authorities, and procedure** — not
   values. FractaVolta is the commercial deployment face of Cogentia, not a
   separate secret namespace. Full catalog:
   [`docs/secrets-management.md`](../docs/secrets-management.md).
6. **Operational apply and health** use Operium (`operium up`, node diagnose,
   invoke tool) and the procedures in
   [`docs/magistral-coding-agent-routing.md`](../docs/magistral-coding-agent-routing.md).

## Non-goals

- Putting vendor API keys for Grok/Claude/Codex on fracta (auth stays on the
  coding-agent host).
- Public Internet exposure of Agent Gateway.
- Treating `cogentia/deploy/fracta/` as the ops source of truth.

## Consequences

- Guide conversational quality depends on ThinkPad (or peer) gateway **online**
  + matching bearer token in Magistral env.
- Cogentia may keep **thin** app-side pointers only; desired map lives under
  `operium/profiles/` and docs.
- Caddy split (Views vs Guide/MCP paths) is an operational fact recorded in
  Operium; changes go through Operium notes, not ad-hoc agent-only edits without
  registry evidence.

## Related

- [`docs/magistral-coding-agent-routing.md`](../docs/magistral-coding-agent-routing.md)
- [`docs/secrets-management.md`](../docs/secrets-management.md) — dual authority + `COGENTIA_API_KEY` rotation
- [`docs/fracta-trust-perimeter.md`](../docs/fracta-trust-perimeter.md)
- [`docs/fractanet-mesh.md`](../docs/fractanet-mesh.md)
- [`profiles/magistral-map.coding-agents.v1.json`](../profiles/magistral-map.coding-agents.v1.json)
- Cogentia boundary: `cogentia/docs/cogentia-magistral-boundary.md`
- Agent gateway: `cogentia/research/agent_cli_gateway.md`
