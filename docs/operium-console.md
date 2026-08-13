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
export VITE_CONSOLE_BASE=/ops/console/
npm run build
```

Deploy `dist/` to fracta static path (e.g. `/ops/console/`). Same-origin `fetch('/ops/status')` needs no CORS entry.

## Views (v1)

| View | Endpoints | Auth |
|------|-----------|------|
| Fleet overview | `GET /ops/status`, `GET /ops/blackboard?capability=operium.node.v1` | none |
| Work / Fix Bugs First | `GET /views/fix-bugs-first-dashboard.json?raw` | none (public derived view) |

The Work / Fix Bugs First panel is public and read-only. It displays the public Cogentia
projection, preserves each item's native GitHub link, and never edits the
Operium backlog or GitHub from the browser. Generate and publish it with:

```text
cd ../cogentia
node scripts/generate-fix-bugs-first-dashboard.js
node scripts/cogentia.js publish push fix-bugs-first-dashboard
node scripts/cogentia.js publish push fix-bugs-first-dashboard-json
```

## Private work boundary

`/ops/console/` is intentionally not the private console. Authenticated work is entered through
John at `https://jhn.baronsmariani.org/nasa`; its server boundary validates a Supabase session and
an explicit operator allow-list before it can call any action bridge. Do not add a static token,
node detail, or action endpoint to this public bundle.

## Toolchain

| Package | Version |
|---------|---------|
| vite | ^7.2 |
| react | ^18.3 |
| tailwindcss | ^4.1 |
| Node | ≥ 20 (24 recommended) |
