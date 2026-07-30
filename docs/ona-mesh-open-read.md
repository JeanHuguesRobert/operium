---
title: "ONA mesh-open read (P1)"
description: "Unauthenticated GET status/SOMA on Tailscale for La Nasa MIB-lite v0."
document_role: operational
document_kind: runbook
visibility: public
lifecycle_state: active
updated: "2026-07-30"
---

# ONA mesh-open read (P1)

Enables **unauthenticated GET** of management read surfaces on the Fractanet
**Tailscale** mesh for control-room MIB-lite v0
([control-room-mib-lite-v0.md](control-room-mib-lite-v0.md)).

## Flag

```bash
ONA_MESH_OPEN_READ=1
```

When set, these succeed **without** `Authorization: Bearer …`:

- `GET /node/status`, `/node/peers`, `/node/snapshot`, `/node/drift`, `/node/logs`
- `GET /soma/object`, `/soma/observations`, `/soma/actions`
- `GET /graph/*` (when exposed)

Still **require tokens**:

- `POST /node/probe` (admin)
- `POST /node/cop` (peer/admin)
- `POST /soma/actions/*` (admin)

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

## Fleet smoke (P1 done)

| Node | `GET /node/status` | `GET /soma/object` | `POST /node/probe` (no token) |
|------|--------------------|--------------------|-------------------------------|
| fracta | 200 | 200 | 401 |
| i7-thinkpad-jhr | 200 | 200 | 401 |
| rpi3-view | 200 | 200 | 401 |
| poco-jhr | 200 | 200 | 401 |

## Related

- Code: `lib/node-agent/config.js` (`meshOpenRead`), `lib/node-agent/http-server.js` (`hasReadAuth`)
- Test: `scripts/test-ona-mesh-open-read.js`
