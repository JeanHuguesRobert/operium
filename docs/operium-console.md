---
title: Operium Console
author: unknown
affiliation: Institut Mariani / C.O.R.S.I.C.A., 1 cours Paoli, F-20250 Corte, Corsica
date: null
last_modified_at: '2026-10-05'
license: CC BY-SA 4.0
language: en
document_role: "operational"
document_kind: "documentation"
visibility: "public"
lifecycle_state: "active"
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/operium-console.md
status: working-paper
update_policy: UP-DEFAULT-REVIEWED
provenance:
  origin_type: repository
  origin_repository: JeanHuguesRobert/operium
  origin_ref: unknown
  origin_date: unknown
  derived_from: []
review:
  status: unreviewed
  reviewed_by: []
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

### Fracta deployment evidence — 2026-10-05

- Source: Operium commit [`5a88a4a`](https://github.com/JeanHuguesRobert/operium/commit/5a88a4ac5a6aebf7e02985f7e1d2428fa041ba88).
- Caddy serves `/ops/console/` from `/srv/ops-console` on `fracta`.
- The production build used `VITE_COGENTIA_OPS_BASE_URL=https://cogentia.fractavolta.com` and `VITE_CONSOLE_BASE=/ops/console/`.
- Post-deploy checks returned HTTP 200 for `/ops/console/`, its JavaScript bundle, and `/ops/status`. The served bundle contains the public HTML dashboard link and retains the in-console work panel.
- The previous static bundle is retained on Fracta at `/srv/ops-console.rollback-20261005-5a88a4a` for rollback.

## Views (v1)

| View | Endpoints | Auth |
|------|-----------|------|
| Fleet overview | `GET /ops/status`, `GET /ops/blackboard?capability=operium.node.v1` | none |
| Work / Fix Bugs First | `GET /views/fix-bugs-first-dashboard.html?raw` (human), `GET /views/fix-bugs-first-dashboard.json?raw` (panel data) | none (public derived view) |

The Work / Fix Bugs First link opens a standalone, readable HTML report. The
in-console panel remains available and consumes JSON as its data format. Both
views are public and read-only, preserve native GitHub links, and never edit the
Operium backlog or GitHub from the browser. Refresh locally with:

```text
cd ../cogentia
node scripts/cogentia.js dashboard refresh --json
```

The command reads current public GitHub issues and Operium's `main` backlog.
It leaves the snapshot timestamp and files unchanged when the source content
has not changed. `--dry-run` reports files that would change. Commit and push
the generated files separately, then publish the three views:

```text
node scripts/cogentia.js publish push fix-bugs-first-dashboard
node scripts/cogentia.js publish push fix-bugs-first-dashboard-html
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
