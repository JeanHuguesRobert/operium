---
document_role: "operational"
document_kind: "documentation"
visibility: "public"
lifecycle_state: "active"
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "documentation"
classification_confidence: "medium"
---

# Operium Console

Standalone Vite + React dashboard at `operium/apps/console/`. It is the **public read-only La Nasa view** — deploy at `/ops/console/` on Fracta. `cogentia/scripts/ops/fractanet-dashboard.html` remains a fallback JSON viewer only.

## Constraints

- Browser polls **fracta `/ops/*` only** — never remote peer `:8794`.
- Fleet views (`/ops/status`, `/ops/blackboard`) are **public** (no token).
- The public bundle contains no node token, private node detail, or action controls. Those belong behind the authenticated John boundary at `https://jhn.baronsmariani.org/nasa`.

## Development

```bash
cd operium/apps/console
cp .env.example .env
npm install
npm run dev
```

Open http://127.0.0.1:5174 — Vite proxies `/ops` to `https://cogentia.fractavolta.com` and `/node` to local ONA (`127.0.0.1:8794`) for host-only debugging.

## Production build (fracta same-origin)

```bash
cd operium/apps/console
export VITE_COGENTIA_OPS_BASE_URL=https://cogentia.fractavolta.com
export VITE_COGENTIA_OPS_TOKEN="<COGENTIA_OPS_READ_TOKEN>"
export VITE_CONSOLE_BASE=/ops/console/
npm run build
```

Deploy `dist/` to fracta static path (e.g. `/ops/console/`). Same-origin `fetch('/ops/status')` needs no CORS entry.

## Views (v1)

| View | Endpoints | Auth |
|------|-----------|------|
| Fleet overview | `GET /ops/status`, `GET /ops/blackboard?capability=operium.node.v1` | none |
| Node detail | `GET /ops/node/{encodeURIComponent(node_id)}/status` | `VITE_COGENTIA_OPS_TOKEN` |
| Drift panel | `GET /ops/node/{encodeURIComponent(node_id)}/drift` | same token |

## Node ID encoding

Always use `encodeURIComponent(node_id)` in paths:

| Logical ID | Path segment |
|------------|--------------|
| `resource://fracta` | `resource%3A%2F%2Ffracta` |
| `resource://i7-thinkpad-jhr` | `resource%3A%2F%2Fi7-thinkpad-jhr` |

## Fracta server env (aggregator)

Set on `cogentia-mcp-http` (fracta) — never in the browser bundle:

| Variable | Role |
|----------|------|
| `COGENTIA_OPS_READ_TOKEN` | Ingress auth for `GET /ops/node/{id}/status\|drift` from console |
| `ONA_READ_TOKEN` | Egress bearer when fracta proxies to peer ONA `:8794` |
| `ONA_PORT` | Expected ONA listen port (default `8794`) for endpoint validation |

`GET /ops/status` and `GET /ops/blackboard` remain unauthenticated.

## Toolchain

| Package | Version |
|---------|---------|
| vite | ^7.2 |
| react | ^18.3 |
| tailwindcss | ^4.1 |
| Node | ≥ 20 (24 recommended) |