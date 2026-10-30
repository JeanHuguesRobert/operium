---
title: "KYS Services — Fracta2 publication behind Fracta HTTPS edge"
description: "Observed two-tier routing and proposed safe publication of the Cogentia Personal static application"
author: "Cogentia / Operium"
date: "2026-10-30"
last_modified_at: "2026-10-30"
version: "0.1"
status: "working-paper — predeployment plan, not applied"
license: "CC BY-SA 4.0"
language: en
document_role: operational
document_kind: deployment-plan
visibility: public
lifecycle_state: working
update_policy: UP-INFRASTRUCTURE-HEALTH
provenance:
  origin_type: observation
  origin_repository: JeanHuguesRobert/operium
  origin_ref: "https://github.com/JeanHuguesRobert/cogentia/pull/296"
  origin_date: "2026-10-30"
  derived_from:
    - docs/living-books-deployment.md
review:
  status: unreviewed
  reviewed_by: []
---

# KYS Services — Fracta2 publication plan

## Deployment decision and current observations

**Intent:** publish Cogentia Personal's KYS Services and Serenia/RSA routes on the noncommercial public-interest hostname `services.acorsica.org`, without Netlify. The application is a React/Vite static SPA for these paths. **This document is a plan, not a deployment receipt.**

Read-only inspection on 2026-10-30:

- `fracta2`: Caddy active (`/usr/bin/caddy run --config /etc/caddy/Caddyfile`). Its Caddyfile imports `/etc/caddy/Caddyfile.d/*.caddy`, including `privai.caddy`, `commons.caddy`, `capable.caddy`, etc. Listener on `:80`, **no listener on `:443`**.
- Existing origin vhosts use `http://HOST { root * /srv/www/NAME/current; encode zstd gzip; file_server }`. `/srv/www/NAME/current` points to a versioned directory under `releases/`, providing a low-cost rollback.
- Existing public HTTPS vhosts `privai.acorsica.org` and `commons.acorsica.org` resolve to `82.70.234.207`, respond `HTTP/2 200`, expose `server: Caddy`, `via: 1.1 Caddy`, and present Let's Encrypt certificates.
- `operium/docs/living-books-deployment.md` identifies `fracta` as the **TLS-terminating public edge** and `fracta2` as the **HTTP origin** over Tailscale at `100.84.109.87:80`.
- `services.acorsica.org` **did not resolve** on the origin at observation time.
- Direct SSH from `fracta2` to `fracta` was **unavailable** on ports 22 (connection refused) and 1022 (connection reset). The edge's current running configuration **was not inspected**, so any new edge route requires a separate verification before apply.
- Caddy's current configuration on Fracta2 validated successfully. The local origin returned 200 for the existing Capable/PrivAI/Commons vhosts.
- Read-only tool access to Fracta2 is available, but the delegated shell has no `sudo` privileges (no_new_privileges). Production writes, Caddy reload, DNS and certificates must go through the existing **Operium** control plane or the appropriate authorized operator.

## Apex versus subdomain: verified routing decision (2026-10-30)

The Principal offered `https://acorsica.org/services` as a possible simpler alternative. Live probes disprove that it is simpler **for a direct Fracta2 publication**:

- `acorsica.org` resolves to GitHub Pages addresses (sample `185.199.108.153`); `https://acorsica.org/` responds 200 with `Server: GitHub.com`.
- `https://acorsica.org/services` returns 404 from GitHub Pages.
- `www.acorsica.org` is also GitHub Pages and redirects to the apex.
- Fracta2's origin Caddy has no apex host route; probing the apex against origin port 80 did not deliver the apex site.
- By contrast, `privai.acorsica.org` is served through the established Fracta→Fracta2 Caddy topology.

**Decision:** retain `services.acorsica.org` as the direct Fracta2 deployment target. An optional discovery link or HTTP redirect at `acorsica.org/services` can be published through the **existing GitHub Pages website source**, but that is a separate change to the apex site, not an ingress for Fracta2. Do not replace apex DNS, move the entire main website, or assume path-based routing on the Fracta edge without deliberate migration.

## Target request path

```text
visitor -> https://services.acorsica.org:443
        -> DNS-only CNAME services -> fracta.fractavolta.com (proposed)
        -> Fracta edge Caddy: HTTPS/TLS, ACME, Host preservation
        -> http://100.84.109.87:80 (Tailscale)
        -> Fracta2 Caddy: host services.acorsica.org
        -> /srv/www/kys-services/current (versioned Vite dist)
        -> index.html, /assets/*, /kys-services.json, /services/*.json
```

**No new external TCP port, new daemon, or second TLS endpoint on Fracta2 is required.** Do not reuse `:8444` (existing browser proxy) or interfere with the catch-all `:80` browser routing. SNI routing belongs at Fracta's existing HTTPS gateway; hostname routing at Fracta2.

## Proposed origin Caddy fragment (not applied)

Path: `/etc/caddy/Caddyfile.d/kys-services.caddy`

```caddyfile
http://services.acorsica.org {
    root * /srv/www/kys-services/current
    encode zstd gzip

    # Strict static-file handling: a missing manifest or JS bundle should not
    # silently return index.html with HTTP 200.
    @kys_static path /assets/* /services/*.json /kys-services.json
    handle @kys_static {
        file_server
    }

    # BrowserRouter direct links: /services, /rights, /snapshot, /waitlist.
    handle {
        try_files {path} /index.html
        file_server
    }
}
```

Run `caddy validate --config /etc/caddy/Caddyfile` before reloading through Operium. Preserve all existing site blocks. Verify `curl -I -H 'Host: services.acorsica.org' http://127.0.0.1:80/services` (SPA) and JSON routes; a missing `/assets/x.js` must return 404, not HTML.

## Proposed Fracta edge Caddy vhost (not applied)

Actual edge configuration must be inspected via its authorized control plane first, to avoid duplicating a wildcard or existing site route. If none exists, the conceptual addition is:

```caddyfile
services.acorsica.org {
    reverse_proxy http://100.84.109.87:80
}
```

Reuse the edge's current TLS/certificate/ACME policy and routing conventions. Do not open 443 on Fracta2. Do not make `tls_insecure_skip_verify` a new dependency for a static site.

## Repeatable Cloudflare credential resolution (2026-10-30)

The Agent JHN application vault is **JHN Supabase `public.instance_config`**, distinct from the empty native `vault.secrets` extension. The canonical code is in Inseme's configuration/vault tooling; operational policy belongs in `operium/docs/secrets-management.md`.

Authenticated metadata checks found 156 JHN `instance_config` rows, but **no Cloudflare credential entry**. Thus the previous assumption that the DNS credential is already stored in that vault is not supported by the current database. Historical DNS updates used an existing credential in the trusted operator workstation's `inseme/.env`; Fracta2's delegated runtime did not expose that credential.

The script `scripts/provision-kys-services-dns.mjs` now supports two non-disclosing credential sources:
1. An authorized process environment with a Cloudflare API token, including the historical credential name.
2. A fallback direct lookup in JHN `instance_config`, authenticated by JHN's Supabase service-role configuration. It requires an existing Cloudflare key row.

For future agents: first check **credential presence by key name only**, never print secret values. If absent, synchronize the **specific** credential from the existing workstation source through Inseme's authorized vault synchronization, rather than copying an entire environment or creating another uncontrolled secret. Then dry-run the idempotent provisioner, apply, and verify Cloudflare and DNS responses. A DNS record does not by itself activate HTTPS; the Fracta edge and Fracta2 origin remain separate steps.

**Current state updated 2026-10-30: credentials populated in JHN Vault; CNAME created and publicly resolving; HTTPS and site deployment pending.** See Operium issue #76.

## Targeted ThinkPad → JHN vault promotion (2026-10-30)

**Root cause found:** Inseme's existing `sync-secrets.js` mapping includes `CLOUDFLARE_TUNNEL_TOKEN`, but not the *Cloudflare DNS API credential*. Consequently the documented broad `--apply --vault` sync does not promote this DNS key. The JHN vault currently has no Cloudflare DNS slot.

Use the narrowly scoped, reviewed script in Inseme:
`apps/platform/scripts/promote-cloudflare-dns-to-jhn-vault.js`.

On the **trusted ThinkPad**, with its original `inseme/.env` and an authorized JHN Supabase service-role credential:

```sh
node apps/platform/scripts/promote-cloudflare-dns-to-jhn-vault.js
node apps/platform/scripts/promote-cloudflare-dns-to-jhn-vault.js --apply
```

The first operation is read-only. The second now promotes **all nonempty `CLOUDFLARE_*` keys** from the trusted workstation `.env`, rather than only the DNS token. This includes the account ID, DNS API key, and R2 access key ID/secret/endpoint, plus any subsequently introduced Cloudflare-prefixed credentials. Keys are mapped mechanically to lowercase `instance_config` names (e.g. `CLOUDFLARE_S3_SECRET_ACCESS_KEY` → `cloudflare_s3_secret_access_key`). It checks the JHN project, detects all conflicts before writing, sets `is_secret=true, is_public=false` for every promoted key and verifies each write without printing values. **It does not synchronize any non-Cloudflare provider or erase old keys.** If existing values differ, it refuses overwriting until reconciled. Fetch latest Inseme `main` before running on ThinkPad.


Then, from an **authorized environment** with JHN Vault service-role access, run Operium's DNS provisioner in dry-run and `--apply`, followed by DNS verification. The delegated Fracta2 shell lacks direct key/service-role access; the DNS record was created instead through an authenticated, secret-safe Supabase SQL/HTTP operation as described below.

## Deployment receipt: Cloudflare DNS created (2026-10-30)

**DNS completed; HTTPS application not yet deployed.** The five `CLOUDFLARE_*` keys were synced from the trusted ThinkPad into JHN Supabase `public.instance_config` and verified by a read-only metadata query: all present, `is_secret=true`, `is_public=false`. No secret values were printed.

**Reusable secure provider-call method:** The JHN Supabase database has the `extensions.http` extension. An authorized Supabase SQL session can construct the Cloudflare `Authorization: Bearer` header **inside the SQL executor** from `instance_config.value`, and call Cloudflare's HTTPS API with `extensions.http(row(method,uri,headers,content_type,body)::extensions.http_request)`. Neither SQL text nor returned result need to contain the secret. Use a narrowly scoped SQL query that:
1. Validates the presence and privacy classification of `cloudflare_api_key` in `public.instance_config`.
2. GETs active zone `acorsica.org` and requires exactly one match.
3. GETs the exact DNS name `services.acorsica.org`, aborting on an existing conflicting record.
4. POSTs only `{"type":"CNAME","name":"services.acorsica.org","content":"fracta.fractavolta.com","proxied":false,"ttl":1}`.
5. Returns only HTTP code, provider `success` flag and public DNS record fields; never `value`, request headers or a full provider response.

**Observed:** zone GET HTTP 200, one active zone; name GET HTTP 200, zero preexisting entries; POST HTTP 200, `success=true`, returned CNAME `services.acorsica.org -> fracta.fractavolta.com`, `proxied=false`. Public Cloudflare and Google DNS-over-HTTPS resolvers both returned the CNAME, TTL 300; local resolver gave `82.70.234.207`.

**Important:** direct `https://services.acorsica.org/` returned a TLS alert (handshake failed), as the Fracta public Caddy HTTPS vhost and/or certificate is **not yet configured**. Fracta2 Caddy virtual host and static release have not been provisioned. No regression/production readiness claim follows from DNS success.

The script `scripts/provision-kys-services-dns.mjs` remains a valid alternative when credentials are available inside an operator process. Supabase `extensions.http` provided a secure alternative to copying credentials into a remote shell invocation. This path requires a privileged, specifically authorized Supabase session; it must not be exposed as an unauthenticated RPC or broad public API.

## DNS (completed; HTTPS not yet configured)

In the existing `acorsica.org` DNS zone (documented as Cloudflare DNS-only), provision only after authorized controls and edge readiness:

```text
CNAME  services  fracta.fractavolta.com  DNS-only  Auto
```

Verify authoritative DNS, certificate, public HTTPS, security headers and correct Host routing. If another record occupies `services`, inspect ownership before changing anything. DNS changes alone will not create the edge vhost.

## Build and release

Source: `JeanHuguesRobert/cogentia`, PR #296 `feat/personal-serenia-rsa-first-step-20261030`. The latest known local browser-recipe SHA was `38fdf31`, which had green GitHub CI on 2026-10-30. Resolve the exact release SHA at apply time, from reviewed mainline state.

Build the existing static frontend with pnpm from the Cogentia workspace, without Netlify:

```sh
pnpm install --frozen-lockfile
pnpm --filter @cogentia/personal build
node scripts/check-kys-services.mjs
# Test the Vite preview and Chromium smoke before staging
```

The site root should be the **contents of `apps/personal/dist/`**, not the entire monorepo. Transfer built files to a new immutable `/srv/www/kys-services/releases/<commit-sha>/` under the same ownership model used for other sites, verify contents and ownership, then atomically repoint `current`. Never build inside an already-live release tree. Use Operium-controlled deployment steps and record receipts/health.

Retain the previous `current` target and release as the rollback point. A symlink switch is sufficient for static code rollback; DNS and edge changes have separate rollback procedures. Verify before and after: host routing, `/`, `/services`, `/rights`, `/snapshot`, `/kys-services.json`, `/services/kys-snapshot.json`, `/services/serenia-rsa.json`, `/assets/*`, and browser refresh on deep links. Check unrelated vhosts (`privai`, `commons`, `capable`) after reload.

## Important application boundary

The KYS/SERENIA public entry paths are static, with **no Netlify dependency** for rendering or prompt copying. However, `apps/personal/src/pages/Submit.jsx` (legacy advanced route) calls `/api/process-analysis`, implemented only in `apps/personal/netlify/functions/process-analysis.js`. **A static-only Fracta2 publication does not supply this API.** Before production, decide whether to hide/disable advanced routes explicitly, or move the function behind a separate authorized service on Fracta2. Do not advertise the legacy functionality as working until implemented and tested.

The existing waitlist optionally uses `VITE_SUPABASE_*` and environment-gated `VITE_WAITLIST_MODE`; it remains intentionally **closed** if not fully configured. Never include service-role keys or private secrets in a Vite public build. The issue of email consent/double opt-in is separately deferred at Cogentia #297. No live lead submission belongs in this deployment check without specific authorization.

## Build staged and validated on Fracta2 (2026-10-30)

**New verified progress:** Cogentia PR #296 at `25b5e99c631ea9e86a28e90afa6134b80dd8476c`, last GitHub Actions run `41117587638` success. Fracta2 fetched the branch into an isolated worktree and successfully ran `pnpm install --frozen-lockfile --offline`, `node scripts/check-kys-services.mjs` (PASS), and `pnpm --filter @cogentia/personal build` (PASS). Chromium exercised `/services` and `/rights` at desktop and mobile widths, 4/4 PASS. Dist bundle is roughly 629 kB and resides on Fracta2 at:

```text
/srv/cogentia/kys-services-staging/source/apps/personal/dist
```

The test preview server was stopped. **This is a staging build, not a public deployment**. The installed Caddy service remains active; `/srv/www/kys-services` does not exist yet and public HTTPS still returns a TLS handshake alert.

Versioned, dry-run-first rollout scripts have been added in Operium:

- `scripts/deploy-kys-services-origin-fracta2.sh` — **run on Fracta2**, uses staged dist, creates `/srv/www/kys-services/releases/<SHA>` and atomic `current` symlink, isolated Caddy vhost in `Caddyfile.d`, validates the combined config, reloads Caddy, checks SPA and manifest URLs, requires authorized root privileges and explicit `--apply`.
- `scripts/deploy-kys-services-edge-fracta.sh` — **run on Fracta**, preflights the origin before adding a new public HTTPS virtual host to its Caddyfile, validates candidate, preserves the previous config for rollback and reloads; requires authorized root and explicit `--apply`.

Both scripts passed `bash -n` when retrieved from GitHub. The **origin script also passed its dry-run on Fracta2**, resolving the exact staged commit/path. No live routing was altered.

**Control boundary:** the delegated Fracta2 shell runs as user `ubuntu` with `no_new_privileges` preventing sudo; `/srv/www` and `/etc/caddy/Caddyfile.d` are root-owned and not writable. Outbound SSH to Fracta via ports 22 and 1022 is unavailable. Thus **neither production `--apply` was executable through this delegated tool**. Do not attempt permission escalation or claim a public site deployment. Execution requires the existing privileged Operium/operator control plane on the relevant host.

Authorized operator sequence, after fetching Operium main:
```bash
# Fracta2 — staged build verified above
bash scripts/deploy-kys-services-origin-fracta2.sh
sudo bash scripts/deploy-kys-services-origin-fracta2.sh --apply

# Fracta — only after origin HTTP Host checks PASS
bash scripts/deploy-kys-services-edge-fracta.sh
sudo bash scripts/deploy-kys-services-edge-fracta.sh --apply

# Final user-visible acceptance
curl -I https://services.acorsica.org/services
curl -I https://services.acorsica.org/rights
curl -I https://services.acorsica.org/kys-services.json
```

Check unrelated `privai`, `commons`, and `capable` hosts after applying. Do not read this block as an assertion that `sudo` is available from this session.

## Go/no-go criteria

1. Reviewed source SHA + green CI, origin Caddy syntax validation and manifest tests; browser desktop/mobile emulation and copy operation.
2. Confirm hostname governance and nonpartisan KYS Services public presentation. No production-only personal dossier requirements.
3. Authoritative DNS and Fracta edge verified before changes, no conflicting host routes; certificate acquisition observable and functioning.
4. Origin static tree served correctly via Host header; SPA fallback correct while missing files return 404.
5. End-to-end HTTPS tests and unrelated vhost regression probes.
6. Receipt in Operium, current SHA/link, edge/origin config revisions, rollback marker and any caveats.

**No deployment performed by this plan.**
