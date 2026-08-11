---
title: "Magistral → coding-agent routing (Guide synthesis)"
date: "2026-07-26"
document_role: operational
document_kind: method
visibility: public
lifecycle_state: active
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "explicit-metadata"
classification_confidence: "medium"
---

# Magistral → coding-agent routing (Guide synthesis)

**Owner:** Operium (operational state, apply, health).  
**App code:** Cogentia Guide / MCP, Inseme Magistral, Agent CLI Gateway.  
**Decision:** [`decisions/magistral-coding-agent-routing.md`](../decisions/magistral-coding-agent-routing.md).

## Observed path (product)

```text
Browser (fractavolta.com/guide)
  → POST https://cogentia.fractavolta.com/guide/chat
      model: fractavolta-guide
  → mcp-cogentia :8791  (public pack + S7; client history)
  → POST cogentia daemon :8790/v1/chat/completions
      alias: fractavolta-guide → magistral
  → Magistral :8880  (router-only, OpenAI Chat Completions + SSE)
  → Agent CLI Gateway on capable host (e.g. ThinkPad :8793)
      model: grok | claude | codex
  → local coding-agent CLI (device auth)
```

Server turns are **stateless**. Conversation continuity is client `history`.

Keep **`COGENTIA_GUIDE_AGENT_GATEWAY=0`** so Guide does not bypass Magistral.

## Desired Magistral map

Canonical template (no secrets):

[`profiles/magistral-map.coding-agents.v1.json`](../profiles/magistral-map.coding-agents.v1.json)

| id | model | tier | weight | Notes |
|----|-------|------|--------|--------|
| coding-grok-fast | grok | fast | 100 | Prefer daily Grok Build |
| coding-claude-fast | claude | fast | 80 | Claude Code |
| coding-codex-strong | codex | strong | 50 | Strong tier |
| openai-* | gpt-* | **fallback** | low | Optional; 401 if key bad |

Live file on fracta (not in git):

```text
/etc/cogentia/magistral-openai-map.json
```

### Secret authority (copies vs overrides)

**Operium owns** the operational secret registry and rotation procedures
([secrets-management.md](secrets-management.md)). Summary for this path:

| Location | Role |
|----------|------|
| **`inseme/.env`** | Workstation **FS authority** for `COGENTIA_API_KEY` (and provider keys) |
| **`instance_config` vault** (`cogentia_api_key`, `is_secret`) | **Edge authority** — edge functions have no FS; push with `sync-secrets.js --apply --vault` |
| `/etc/cogentia/magistral.env` | Runtime **copy** for `magistral.service` |
| Tool-host secrets (ThinkPad `~/.cogentia/secrets/agent-gateway.env`) | Runtime **copy** for Agent CLI Gateway |

**Naming:** **Cogentia** is the system name; **FractaVolta.com** is the commercial entity
that may deploy Cogentia in customer contexts. The shared bearer is **`COGENTIA_API_KEY` only**
(do not also set the same secret under `AGENT_GATEWAY_TOKEN=`). Legacy names remain code
aliases for reading only.

If a copy **must** differ from `inseme/.env`, put a **comment immediately above** the
override explaining why. No silent divergence. Prefer `EnvironmentFile=` over hardcoding
`Environment=TOKEN=…` in systemd drop-ins.

Bearer for gateway nodes: `COGENTIA_API_KEY` must reach Magistral’s process env so
`buildMagistralApiKeys()` can send `Authorization: Bearer …`. **Never** commit values.

Attractor (blackboard): `attractor:i7-thinkpad-jhr:agent-cli-gateway`  
Transport ref (observed): Tailscale `100.122.121.68` / MagicDNS `i7-thinkpad-jhr`.

**Gateway process lifetime (Windows tool host):** logon task, not a detached shell —
see [agent-gateway-windows-lifetime.md](agent-gateway-windows-lifetime.md)
(Linux analog: systemd `Type=simple`).

## Model aliases

| Name | Layer |
|------|--------|
| `fractavolta-guide` | Public Guide facade (`COGENTIA_GUIDE_MODEL`) |
| → `magistral` | Cogentia daemon when `COGENTIA_CHAT_MODEL=magistral` |
| tier `fast` | Magistral when `model === "magistral"` |
| `grok` / `claude` / `codex` | Agent gateway adapter models |

## Apply (operator — via trust perimeter)

Use trusted workstation: `ssh fracta` (see [fracta-trust-perimeter](fracta-trust-perimeter.md)).

```bash
# After operium + cogentia repos are current on the node (or scp map from operium)
sudo cp /path/to/operium/profiles/magistral-map.coding-agents.v1.json \
  /etc/cogentia/magistral-openai-map.json
sudo chown root:ubuntu /etc/cogentia/magistral-openai-map.json
sudo chmod 640 /etc/cogentia/magistral-openai-map.json
# COGENTIA_API_KEY: copy from inseme/.env (FS authority). Name COGENTIA_API_KEY only.
# Also push vault for edge: cd inseme/apps/platform && node scripts/sync-secrets.js --apply --vault
# If /etc/cogentia/magistral.env must differ, comment the override above the value.
# Value never logged / never git.
sudo systemctl restart magistral.service
# After inseme deploy of buildMagistralApiKeys fix, restart is required so router picks env.
sudo /srv/cogentia/repos/cogentia/scripts/ops/fracta-guide-stack.sh restart
```

Helper on fracta (after pull): `operium/scripts/ops/apply-magistral-coding-map-fracta.sh`  
Rotate system bearer: see [secrets-management.md — Rotating COGENTIA_API_KEY](secrets-management.md).

### Apply + verify (OP-FEAT-001 / issue #10)

```bash
# On fracta (trusted SSH)
cd /srv/cogentia/repos/operium
git pull --ff-only
bash scripts/ops/apply-magistral-coding-map-fracta.sh --dry-run   # show would_fast / current_fast
bash scripts/ops/apply-magistral-coding-map-fracta.sh             # install map, token hygiene, restart, verify

# Structural verify only (workstation or fracta)
node scripts/ops/verify-magistral-coding-map.js --human
# After scp/sudo cat of live map:
node scripts/ops/verify-magistral-coding-map.js --live /tmp/magistral-openai-map.json --human
```

`verify-magistral-coding-map.js` checks:

- profile invariants: `coding-*` at `fast|strong`, `apiKeyEnv=COGENTIA_API_KEY`, OpenAI not primary
- live compare: coding nodes present with matching tier/model, chat-completions URL, OpenAI not `fast` when coding is `fast`

Exit `0` = structure OK (does **not** prove Guide conversational quality — still smoke `/guide/chat`).

## Health (Operium tools)

```bash
# From trusted workstation
cd operium && node bin/operium.js up --human
node bin/operium.js up --json --section public_face
node bin/operium.js up --json --section action
node bin/operium.js up --json --section services

# Optional: invoke coding agent via Operium (action plane), not public Guide
node bin/operium.js invoke tool --model grok -p "Say hello in one short sentence." --host i7-thinkpad-jhr
```

Public smoke (after map applied):

```bash
curl -fsS -m 30 https://cogentia.fractavolta.com/guide/health
curl -fsS -m 120 -X POST https://cogentia.fractavolta.com/guide/chat \
  -H 'Content-Type: application/json' \
  -d '{"question":"What is Potentics?","locale":"en"}'
# Expect: mode=conversational when coding gateway healthy; s7.ok for Potentics
```

## Guide semantic-retrieval signal

Semantic or hybrid retrieval is the nominal Guide regime. A keyword fallback or
a continuation-required retrieval run is **degraded**, not a normal operating
mode. The public `/guide/health` endpoint reports the last observed state:
`unknown` before a Guide retrieval has run, then `nominal` or `degraded`.

On Fracta, configure ONA with the non-secret endpoint reference
`ONA_GUIDE_HEALTH_URL=http://127.0.0.1:8791/guide/health`. Its
`guide_semantic` probe fails when that state is `degraded`, making the condition
visible in Operium status and its health score. Restore the embedding/index
path before treating a degraded answer as a model-quality result.

## Related Caddy split (observed 2026-07-26)

`cogentia.fractavolta.com` must split:

- **Guide/MCP/ops** → `127.0.0.1:8791`
- **Views Store** → `localhost:3423`

Template fragment for the MCP paths lives with the app as
`cogentia/deploy/fracta/Caddyfile.snippet` (app artifact). **Desired public
routing and change control** are Operium concerns (this doc +
[views-store-caddy-service](../decisions/views-store-caddy-service.md)).

## Failure modes

| Symptom | Check |
|---------|--------|
| `extractive_fallback` | Magistral nodes all failing; gateway offline; token mismatch |
| S7 ok but no prose | Synthesis path only — map/token |
| `operium up` action degraded | Blackboard attractor stale; ThinkPad sleep |
| OpenAI 401 in Magistral logs | Expected if cloud fallback key bad; keep fallback only |
| `magistral_router:false` / chat hits `:8081` | **`MAGISTRAL_API_KEY` empty in process env** (common if `inseme/.env` has a blank assignment after unit `Environment=`). Router enable only — not the gateway bearer. Health shows `chat_completions:false`. Fix: non-empty value (e.g. `local-loopback`) in the **last** systemd `EnvironmentFile=` (see `/etc/cogentia/magistral-router.env` + `zzz-router-key.conf`). |
| Daemon `ai_router_unavailable` ~15s while Magistal traffic log shows 200 | **`COGENTIA_AI_ROUTER_TIMEOUT_MS`** default 15s aborts Magistal→ThinkPad hops (often 15–30s). Set ≥90000 on `cogentia.service`. Also raise **`COGENTIA_MCP_TIMEOUT_MS`** on `mcp-cogentia` (planner + synthesis each need a hop). |
| Fracta cannot reach `:8793` | ThinkPad gateway process down (not Tailscale). Prefer `health?quick=1`; full `/health` is slow (adapter probes). |

### Observed timeouts (2026-07-28)

| Layer | Env | Working value on fracta |
|-------|-----|-------------------------|
| Cogentia daemon → Magistal | `COGENTIA_AI_ROUTER_TIMEOUT_MS` | `90000` (`cogentia.service.d/ai-router-timeout.conf`) |
| MCP Guide → daemon | `COGENTIA_MCP_TIMEOUT_MS` | `90000` (`mcp-cogentia.service.d/timeout.conf`) |
| Magistal router enable | `MAGISTRAL_API_KEY` | `local-loopback` (not `COGENTIA_API_KEY`) |

Public smoke expects `mode=conversational` and `s7.ok` for Potentics when gateway + Magistal + timeouts are healthy (allow ~60–120s wall clock for planner+synthesis).
