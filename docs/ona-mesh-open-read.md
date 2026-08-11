---
title: "ONA mesh-open read (P1)"
description: "Unauthenticated GET status/SOMA on Tailscale for La Nasa MIB-lite v0."
document_role: operational
document_kind: runbook
visibility: public
lifecycle_state: active
updated: "2026-07-30"
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "explicit-metadata"
classification_confidence: "medium"
---

# ONA mesh-open read (P1)

Enables **unauthenticated GET** of management read surfaces on the Fractanet
**Tailscale** mesh for control-room MIB-lite v0
([control-room-mib-lite-v0.md](control-room-mib-lite-v0.md)).

## Flag

```bash
ONA_MESH_OPEN_READ=1
```

If unset, **defaults to the same value as `ONA_HEALTH_PUBLIC`** (so desk/fleet
nodes that already publish public health also open read GETs). Set
`ONA_MESH_OPEN_READ=0` to force token-only read.

When open, these succeed **without** `Authorization: Bearer …`:

- `GET /node/status`, `/node/peers`, `/node/snapshot`, `/node/drift`, `/node/logs`
- `GET /soma/object`, `/soma/observations`, `/soma/actions`
- `GET /graph/*` (when exposed)

Still **require tokens**:

- `POST /node/probe` (admin **or** mesh desk sesame `sesame42` when `ONA_MESH_OPEN_READ=1`)
- `POST /node/cop` (peer/admin)
- `POST /soma/actions/*` (admin **or** mesh desk sesame `sesame42` when mesh-open — La Nasa `/cgi-bin/action`)

`ONA_HEALTH_PUBLIC=1` continues to cover `/health`, `/.well-known/soma`,
`/soma/vocabulary`.

## Trust

- Bind ONA on Tailscale-reachable addresses (`0.0.0.0` or tailnet IP) only inside
  the mesh; **do not** publish `:8794` on the public Internet.
- Application auth can return later if the perimeter expands.

## Apply on a node

Add to the node’s ONA env file (do not remove existing admin/peer tokens):

```bash
# e.g. /srv/cogentia/secrets/ona.env or ~/.cogentia/secrets/ona.env
ONA_MESH_OPEN_READ=1
```

Restart the agent, then smoke from another mesh host:

```bash
curl -fsS http://<node>:8794/node/status | head
curl -fsS http://<node>:8794/soma/object | head
curl -fsS -o /dev/null -w "%{http_code}\n" -X POST http://<node>:8794/node/probe
# expect 401 without admin token
```

## Fleet smoke (P1 — 2026-07-30)

| Node | `GET /node/status` | `GET /soma/object` | `POST /node/probe` (no token) | Notes |
|------|--------------------|--------------------|-------------------------------|--------|
| fracta | 200 | 200 | 401 | drop-in + pull |
| rpi3-view | 200 | 200 | 401 | runtime code patch + env |
| poco-jhr | 200 | 200 | 401 | pull + `ONA_BIND=0.0.0.0` |
| i7-thinkpad-jhr | 200 | 200 | 401 | NSSM service after elevated restart / reboot |

**P1 accepted 2026-07-30** — all four nodes mesh-open for read.

## Related

- Code: `lib/node-agent/config.js` (`meshOpenRead`), `lib/node-agent/http-server.js` (`hasReadAuth`)
- Test: `scripts/test-ona-mesh-open-read.js`
