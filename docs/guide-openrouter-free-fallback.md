---
title: "Public Guide OpenRouter free fallback"
date: "2026-08-22"
document_role: operational
document_kind: runbook
visibility: public
lifecycle_state: active
update_policy: UP-DEFAULT-REVIEWED
---

# Public Guide OpenRouter free fallback

## Purpose

The public FractaVolta Guide normally prefers its existing synthesis route. This
drop-in enables a **specific free OpenRouter model** only after the normal
providers fail. It is a bounded availability fallback, not the quality-default
model and not an authorization to broaden the public Guide mandate.

The Guide remains public-corpus-only and read-only. The selected free route
permits provider data collection for this public surface; never use it for a
private corpus view, secrets, owner stores, or WhatsApp private messages.

## Runtime configuration

`OPENROUTER_API_KEY` remains a host-only value in
`/srv/cogentia/secrets/guide.env`. Do not put it in this repository or a
systemd drop-in.

Install the versioned non-secret drop-in:

```bash
sudo mkdir -p /etc/systemd/system/mcp-cogentia.service.d
sudo cp /srv/cogentia/repos/operium/templates/agent-john/mcp-cogentia.service.d-guide-openrouter-free.conf.example \
  /etc/systemd/system/mcp-cogentia.service.d/guide-openrouter-free.conf
sudo systemctl daemon-reload
sudo systemctl restart mcp-cogentia.service
```

The default model is `liquid/lfm-2.5-2.6b:free`. Override only after a
source-grounded public Guide smoke demonstrates a better candidate.

## Safety and fallback contract

- Paid providers retain their normal priority.
- The free route has a separate circuit breaker, so paid-credit exhaustion does
  not suppress it.
- Empty or truncated free completions are rejected.
- A rejected free completion returns the existing extractive public answer.
- A successful free answer reports `mode: "openrouter_free_fallback"` and the
  `guide_synthesis_openrouter_free_fallback` warning.

## Verify

```bash
sudo systemctl is-active mcp-cogentia.service
curl -fsS -m 30 https://cogentia.fractavolta.com/guide/health
curl -fsS -m 90 -X POST https://cogentia.fractavolta.com/guide/chat \
  -H 'Content-Type: application/json' \
  -d '{"question":"Explain FractaVolta simply from the public corpus.","locale":"en"}'
```

Confirm that any free response is labelled as such, has a non-empty answer and
public sources, and that an unavailable or incomplete free completion falls
back to `extractive_fallback`.

## Deployment record

On 2026-08-22 this configuration was applied on `fracta` with Cogentia commit
`fe08adb` present and Operium commit `7221d3c` installed. The protected
`OPENROUTER_API_KEY` was projected from the local runtime secret source to the
host-only Guide environment file; it was never recorded here. `mcp-cogentia`
was active, listening on port 8791, and its health endpoint reported the free
fallback adapter enabled. The public HTTPS Guide returned a cited canonical
public answer. A forced non-cached request reached the free model, whose
incomplete completion was rejected by the guard and isolated by its dedicated
circuit breaker, leaving the existing public fallback contract in force.

## Rollback

```bash
sudo rm /etc/systemd/system/mcp-cogentia.service.d/guide-openrouter-free.conf
sudo systemctl daemon-reload
sudo systemctl restart mcp-cogentia.service
```
