# JHN migration: FractaFunction staged integration and controlled cutover

## Verified locally on Fracta2 (2026-11-10)

- The built JHN SPA (`apps/platform/dist`) serves `/cop/consent/:id` with the
  updated ratification UI without a Netlify rebuild.
- One Node.js facade (`127.0.0.1:8795`) dispatches to one *real* legacy Node
  Netlify PDF function, the canonical COP consent listener (`127.0.0.1:8796`)
  and one Deno worker (`127.0.0.1:8797`), by an exact route manifest.
- The real Deno territorial-context function returns `400` for missing Corsica
  coordinates, without external calls.
- Canonical COP returns `401` with no bearer and `403` with an invalid bearer.
  The facade preserves these results; the original Netlify proxy did not
  preserve the backend `401` in the same way.
- No real Principal Supabase browser session, signed COP decision or public
  domain cutover was performed. The three mandates and approval journal were
  not modified.

## Operator stage: requires pre-existing SSH/sudo owner access

```bash
ssh -tt fracta2 'sudo python3 /srv/cogentia/repos/operium/runtimes/serverless/deploy/install-jhn-fractafunction-preview.py --apply'
```

Without `--apply`, the script prints the anticipated changes and does not
modify systemd. With `--apply`, it installs and starts **only** two loopback
systemd services; performs a 200/400/401 smoke test; rolls back newly installed
units on any failure. It modifies no Caddy, DNS, COP mandate or decision
configuration. The Deno runtime has no blanket filesystem/process permissions.

## Inspect the preview from the owner's workstation

```powershell
ssh -L 8795:127.0.0.1:8795 fracta2
```

With that SSH session open, inspect `http://127.0.0.1:8795/cop/consent/<UUID>`
using a *test challenge reference only*. The preview uses its own localhost
browser origin; Supabase login, redirects and approval **cannot be claimed
validated** on this URL. The protected backend still verifies bearer tokens
and canonical origin; no COP grant is implied by the preview.

## Cutover dependencies and explicit acceptance

1. Confirm the correct versioned SPA and manifest are actually installed.
2. Inventory and migrate or explicitly disable all public JHN API routes not
   yet provided here. **Current manifest covers only the canonical COP consent
   relay, PDF and territorial context.** `nasa-control`, `interactions-desk`,
   `chat-stream`, `/api/jhn-cop-events`, GitHub webhook, `/api/oleole/*`,
   `artifact-access/*` are **not production migrated**. Their API paths must
   fail closed; silent SPA fallback is prohibited.
3. Review secrets and authentication per route, especially Supabase service
   role usage and user-bound authority. Confirm that Caddy restores the public
   HTTPS origin. The local preview uses a canonical-origin Request internally,
   but this is **not** proof of authenticated production-browser behavior.
4. Prepare TLS certificate provisioning and DNS migration; inspect Caddy
   fragment `jhn-caddy-cutover.caddy` and confirm no conflicting virtual host.
5. After an explicitly authorized cutover, test real user login, anonymous
   refusal, a valid read-only challenge and an invalid challenge; do not
   activate decision recording until the authorized approval protocol is
   intentionally enabled. Record all effect receipts and rollback points.
6. Roll back the DNS to Netlify and remove the new virtual host if regression
   fails, keeping the canonical COP journal intact.

The Caddy cutover fragment is deliberately **not installed** or loaded.
Promoting the site before migrating its remaining APIs would break existing
features, even though the specific COP static page works locally.
