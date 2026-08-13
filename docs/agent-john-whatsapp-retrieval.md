---
title: "Agent John WhatsApp — retrieval desired state (Fracta)"
author: Grok
date: "2026-08-13"
document_role: operational
document_kind: deployment-handbook
visibility: public
lifecycle_state: active
update_policy: UP-DEFAULT-REVIEWED
related:
  - "fracta-trust-perimeter.md"
  - "cogentia-semantic-stack.md"
  - "https://github.com/JeanHuguesRobert/cogentia/blob/main/docs/agent-john-deployment-operium.md"
  - "https://github.com/JeanHuguesRobert/cogentia/blob/main/research/corpus_librarian_decision_2026-08-12.md"
---

# Agent John WhatsApp — retrieval desired state (Fracta)

Operium owns **how retrieval is configured on the live agent host**.  
Cogentia owns **the adapter code** (`scripts/lib/agent-jhn-whatsapp/draft.js`, corpus librarian).

This document is **desired state + apply/verify**, not a product design essay.

## Fact vs desired

| Item | Status (2026-08-13) |
|------|---------------------|
| Code: `AGENT_JHN_WHATSAPP_RETRIEVAL=guide\|librarian\|shadow` | **In cogentia main** (default `guide`) |
| Fixture + live smoke (no WhatsApp send) | **Verified** from workstation |
| Fracta systemd unit sets retrieval mode | **Not assumed live** until applied + observed |
| Production WhatsApp default | **Must remain `guide`** until deliberate flip |

Do not treat “code merged” as “Fracta is on shadow.”

## Mode contract

| `AGENT_JHN_WHATSAPP_RETRIEVAL` | Live outbound draft | Side path |
|--------------------------------|---------------------|-----------|
| `guide` (default, rollback) | Guide `/guide/chat` + optional OpenAI | — |
| `shadow` (**next live step**) | Guide (unchanged) | Librarian compare on `draft.shadow` only |
| `librarian` | Context Gateway tools → packet → synth | — |

**Rule:** enable **`shadow` first**. Do **not** set `librarian` on Fracta until a deliberate live smoke with human review.

Guide is the **website** product path. WhatsApp may reuse it; it is not the permanent boss of the twin channel. See cogentia `research/corpus_librarian_decision_2026-08-12.md`.

## Desired environment (Fracta VPS)

Assumes existing layout from the cogentia handbook:

- code: `/srv/cogentia/repos/cogentia`
- state: `/var/lib/cogentia/agent-john-whatsapp`
- unit: `agent-john-whatsapp.service`
- daemon: `cogentia.service` or equivalent on `127.0.0.1:8790`
- Guide/MCP HTTP: typically `127.0.0.1:8791` (see [fracta-trust-perimeter.md](fracta-trust-perimeter.md))

### Shadow (recommended live pilot)

Secret-free keys (safe to version as **examples**):

```text
AGENT_JHN_WHATSAPP_RETRIEVAL=shadow
AGENT_JHN_WHATSAPP_GATEWAY_URL=http://127.0.0.1:8790
AGENT_JHN_WHATSAPP_GUIDE_URL=http://127.0.0.1:8791/guide/chat
AGENT_JHN_WHATSAPP_GUIDE_TIMEOUT_MS=45000
```

Optional (only if synthesis is already authorized on the host):

```text
# OPENAI_API_KEY from existing vault / EnvironmentFile — never commit
# AGENT_JHN_WHATSAPP_OPENAI_MODEL=gpt-5.6-terra
# AGENT_JHN_WHATSAPP_OPENAI_FALLBACK_MODEL=gpt-4.1-mini
```

Without `OPENAI_API_KEY`, both Guide and librarian still run **extractive** paths. That is enough to validate wiring and `draft.shadow` presence.

### Rollback

```text
AGENT_JHN_WHATSAPP_RETRIEVAL=guide
# or unset the variable entirely
```

Then restart the unit (below).

### Template files

| Path | Role |
|------|------|
| [`templates/agent-john/agent-john-whatsapp.retrieval.env.example`](../templates/agent-john/agent-john-whatsapp.retrieval.env.example) | Key list + comments |
| [`templates/agent-john/agent-john-whatsapp.service.d-retrieval.conf`](../templates/agent-john/agent-john-whatsapp.service.d-retrieval.conf) | systemd drop-in for shadow pilot |

## Apply (Fracta)

Prefer a **systemd drop-in** so the base unit stays readable and rollback is one file delete.

```bash
# On fracta, after cogentia main is pulled and daemon/Guide are healthy:
sudo mkdir -p /etc/systemd/system/agent-john-whatsapp.service.d
sudo cp /srv/cogentia/repos/operium/templates/agent-john/agent-john-whatsapp.service.d-retrieval.conf \
  /etc/systemd/system/agent-john-whatsapp.service.d/retrieval.conf
# edit if Guide URL/port differ on this host
sudo systemctl daemon-reload
sudo systemctl restart agent-john-whatsapp
sudo systemctl status agent-john-whatsapp --no-pager
```

If Operium is not cloned next to cogentia, copy the conf from the GitHub raw template or paste from this doc.

**Do not** freestyle-edit secrets or Baileys session paths while applying retrieval.

## Verify (order)

Observe before declaring live.

### 1. Service health

```bash
# prefer operium fleet view when available
# operium up

sudo systemctl is-active agent-john-whatsapp
curl -fsS -o /dev/null -w '%{http_code}\n' \
  'http://127.0.0.1:8790/api/context/search?q=Cogentia&limit=1&mode=keyword'
curl -fsS -o /dev/null -w '%{http_code}\n' \
  -H 'Content-Type: application/json' \
  -d '{"question":"ping","locale":"en"}' \
  http://127.0.0.1:8791/guide/chat
```

Gateway search should be **200**. Guide chat should be **200** for shadow/guide live answers. Librarian alone can work with gateway only.

### 2. Retrieval smoke (no WhatsApp send)

From cogentia checkout on fracta (or workstation with Tailscale routes):

```bash
cd /srv/cogentia/repos/cogentia   # or local clone
npm run test:agent-jhn-retrieval-smoke
npm run smoke:agent-jhn-retrieval -- --mode shadow --limit 2 \
  --gateway-url http://127.0.0.1:8790 \
  --guide-url http://127.0.0.1:8791/guide/chat
```

Reports: `.cogentia/evals/agent-jhn-retrieval/` (local, gitignored).

### 3. Config inspect

```bash
cd /srv/cogentia/repos/cogentia
node scripts/agent-jhn-whatsapp.js inspect-config
# confirm process environment includes RETRIEVAL=shadow after restart
systemctl show agent-john-whatsapp -p Environment --no-pager
```

### 4. Human WhatsApp self-chat (optional, last)

Only after 1–3 pass. Send a short corpus question in self-chat. Expect:

- reply still **Guide-class** (not a sudden librarian-only provenance as the sole path);
- no third-party send change;
- increased latency possible (parallel librarian).

If anything looks wrong: set `guide`, restart, re-check.

## Explicit non-goals

- Silent flip to `librarian` on production WhatsApp
- Replacing website Guide with librarian
- Putting OpenAI keys in git or in this public doc
- Accumulating parallel runbooks under app `deploy/` that contradict this file

## Evidence log (append when applied)

| When | Host | Mode set | Smoke | Notes |
|------|------|----------|-------|-------|
| 2026-08-13 | workstation | code + smoke only | fixture OK; live shadow vs public Guide + local :8790 OK; live librarian :8790 OK | Fracta unit **not** flipped in that session |
| 2026-08-13 | **fracta** | **`shadow`** via systemd drop-in `retrieval.conf` | fixture shadow OK; live shadow structural OK (gateway 200; Guide probe sometimes slow/timeout under load) | cogentia `d4c5f79`, operium `fc2b3a9`; stashed prior local draft WIP as `fracta-local-before-retrieval-deploy-2026-08-13`; restarted `cogentia`, `mcp-cogentia`, `agent-john-whatsapp` |

When someone applies on Fracta, append a row with date, commit SHAs (cogentia + operium), and smoke report path.
