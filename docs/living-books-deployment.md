---
title: "Living Books — Public Deployment Architecture and DNS Registry"
description: "Operational record and desired DNS configuration for the federation of 11 Living Books on fracta/fracta2."
author: "Jean Hugues Noël Robert, baron Mariani"
affiliation: "Institut Mariani / C.O.R.S.I.C.A., 1 cours Paoli, F-20250 Corte, Corsica"
date: "2026-10-05"
version: "1.0"
status: "working-paper"
language: "en"
license: "CC BY-SA 4.0"
document_role: "operational"
document_kind: "architecture-note"
visibility: "public"
lifecycle_state: "active"
update_policy: "UP-INFRASTRUCTURE-HEALTH"
canonical_url: "https://github.com/JeanHuguesRobert/operium/blob/main/docs/living-books-deployment.md"
related:
  - "fractavolta-caddy-contract.md"
  - "dns-provider-portability.md"
  - "fracta-trust-perimeter.md"
review:
  status: "unreviewed"
  reviewed_by: []
provenance:
  origin_type: "conversation"
  origin_repository: "JeanHuguesRobert/operium"
  origin_ref: "conversation checkpoint 2026-10-05"
  origin_date: "2026-10-05"
  derived_from:
    - "docs/fractavolta-caddy-contract.md"
    - "docs/dns-provider-portability.md"
---

# Living Books — Public Deployment Architecture and DNS Registry

## 1. Overview and Invariants

This document records the operational topology, origin layout, edge routing, and public DNS records for the federation of **11 Living Books** across `acorsica.org` and `baronsmariani.org`.

In accordance with Cogentia/Operium doctrine:
1. **Separation of Corpus and Projection:** The sovereign editorial corpus lives in `barons-Mariani/projects/<book>/`; static projections (`site/`) are compiled and deployed to `/srv/www/<book>/current`.
2. **Two-Tier Topology:**
   - **Tier 1 (Public Edge Gateway — `fracta`):** Terminates TLS with automatic ACME Let's Encrypt / ZeroSSL certificates and reverse-proxies via Tailscale (`http://100.84.109.87:80`) to the origin.
   - **Tier 2 (Origin Content Server — `fracta2`):** Caddy listens on `:80` (modular vhosts in `/etc/caddy/Caddyfile.d/*.caddy`) and serves the static files from `/srv/www/<book>/current`.

---

## 2. Living Books Deployment Matrix

| # | Living Book ID | Public FQDN | DNS Zone | Cloudflare Record | Origin Node & Path | Status |
|---|---|---|---|---|---|---|
| 1 | `village` | `village.acorsica.org` | `acorsica.org` | `CNAME village -> fracta.fractavolta.com` | `fracta2:/srv/www/village/current` | **LIVE (Active)** |
| 2 | `school` | `school.acorsica.org` | `acorsica.org` | `CNAME school -> fracta.fractavolta.com` | `fracta2:/srv/www/school/current` | **LIVE (Active)** |
| 3 | `institut` | `institut.acorsica.org` | `acorsica.org` | `CNAME institut -> fracta.fractavolta.com` | `fracta2:/srv/www/institut/current` | **LIVE (Active)** |
| 4 | `commons` | `commons.acorsica.org` | `acorsica.org` | `CNAME commons -> fracta.fractavolta.com` | `fracta2:/srv/www/commons/current` | **LIVE (Active)** |
| 5 | `privai` | `privai.acorsica.org` | `acorsica.org` | `CNAME privai -> fracta.fractavolta.com` | `fracta2:/srv/www/privai/current` | **LIVE (Active)** |
| 6 | `1755` | `1755.acorsica.org` | `acorsica.org` | `CNAME 1755 -> fracta.fractavolta.com` | `fracta2:/srv/www/1755/current` | **LIVE (Active)** |
| 7 | `capable` | `capable.acorsica.org` *(canonical decision 2026-10-29; old `capable.lepp.fr`)* | `acorsica.org` *(legacy `lepp.fr`)* | `CNAME capable -> fracta.fractavolta.com` | `fracta2:/srv/www/capable/current` | **PUBLIC BLOCKED** — edge HTTP 301 to legacy host (verified 2026-11-05); origin serves HTTP 200 |
| 8 | `napoleon` | `napoleon.acorsica.org` | `acorsica.org` | `CNAME napoleon -> fracta.fractavolta.com` | `fracta2:/srv/www/napoleon/current` | **LIVE (Active)** |
| 9 | `diaspora` | `diaspora.acorsica.org` | `acorsica.org` | `CNAME diaspora -> fracta.fractavolta.com` | `fracta2:/srv/www/diaspora/current` | **LIVE (Active)** |
| 10 | `suicide-corse` | `suicidecorse.baronsmariani.org` | `baronsmariani.org` | `CNAME suicidecorse -> fracta.fractavolta.com` | `fracta2:/srv/www/suicidecorse/current` | **LIVE (Active)** |
| 11 | `rise-and-fall` | `riseandfall.baronsmariani.org` | `baronsmariani.org` | `CNAME riseandfall -> fracta.fractavolta.com` | `fracta2:/srv/www/riseandfall/current` | **LIVE (Active)** |
| 12 | `musee` | `museum.baronsmariani.org` | `baronsmariani.org` | **Desired:** `CNAME museum -> fracta.fractavolta.com`, DNS-only, TTL Auto | `fracta2:/srv/www/musee/current` **(not yet proven deployed)** | **NOT PROVISIONED / NOT LIVE** (preflight 2026-11-15) |

---

## 3. Authoritative DNS Records (Cloudflare)

The authoritative DNS records are hosted on Cloudflare with proxy mode disabled (DNS-only / grey cloud) to allow direct ACME challenge resolution by `fracta`:

### Historical zone `lepp.fr` — abandoned (2026-11-13)

The records below document the former deployment and must not be treated as current DNS or a target to restore. The Principal has abandoned `lepp.fr`. **LePP / U Pertitellu** has a different intended public site at `lepp.baronsmariani.org` (under the `baronsmariani.org` Cloudflare zone), owned by [Inseme #59](https://github.com/JeanHuguesRobert/inseme/issues/59); DNS, TLS and application availability for that host were *not* verified on 2026-11-13. **Capable** stays at `capable.acorsica.org`; do not substitute the LePP host for Capable. A web hostname change does not imply moving the historic `@lepp.fr` mail aliases to a new subdomain.

```text
Type   Name       Target                    Proxy Status   TTL
CNAME  capable    fracta.fractavolta.com    DNS only       Auto
```

### Zone `acorsica.org`
```text
Type   Name       Target                    Proxy Status   TTL
CNAME  village    fracta.fractavolta.com    DNS only       Auto
CNAME  school     fracta.fractavolta.com    DNS only       Auto
CNAME  institut   fracta.fractavolta.com    DNS only       Auto
CNAME  commons    fracta.fractavolta.com    DNS only       Auto
CNAME  privai     fracta.fractavolta.com    DNS only       Auto
CNAME  1755       fracta.fractavolta.com    DNS only       Auto
CNAME  capable    fracta.fractavolta.com    DNS only       Auto (edge still redirects 301 to legacy capable.lepp.fr; must be corrected)
CNAME  napoleon   fracta.fractavolta.com    DNS only       Auto
```

---

## 4. Verification Procedure

Once a CNAME record is configured in Cloudflare:

1. **Verify public DNS resolution:**
   ```bash
   Resolve-DnsName -Name village.acorsica.org -Type CNAME
   ```
2. **Verify public HTTPS endpoint and automated TLS issuance:**
   ```bash
   curl -sI https://village.acorsica.org/
   curl -sI https://village.acorsica.org/book.html
   ```
3. **Verify downloadable projections:**
   ```bash
   curl -sI https://village.acorsica.org/book.pdf
   curl -sI https://village.acorsica.org/book.epub
   ```


## 2026-11-05 — Capable domain migration verification

**Observed, not inferred from the deployment matrix:** From the `fracta2` node, HTTPS HEAD requests to `https://capable.acorsica.org/`, `/en-preparation.html`, and `/guide.html` returned `HTTP/2 301` with `Location: https://capable.lepp.fr/...`. The existing `village.acorsica.org` vhost served HTTP 200, confirming that the public edge was not globally unavailable. The Capable origin responds locally via Fracta2's Caddy host routing (HTTP 200, previously verified).

The documented editorial/hosting decision dated 2026-10-29 makes `capable.acorsica.org` canonical. The original 2026-10-05 matrix describes an older configuration and is not proof of present availability. **Current assessment: public endpoint blocked by stale edge redirect, not yet migrated.** The originating Caddy redirect rule on `fracta` has **not** been inspected in this verification.

**Administration boundary:** From Fracta2, the Fracta Tailscale node remains online, but SSH port 22 refuses connections; TCP 1022 accepts a connection yet SSH negotiation resets; Tailscale SSH reports a failure reaching port 22. No edge configuration changes have been applied. Restore a legitimate administrative route, inspect the live edge virtual host and reload mechanism, change only Capable's redirect behavior, then verify TLS and HTTP for all three paths and regression-test other hosted domains.

**References:** [Capable site publication contract](https://github.com/JeanHuguesRobert/barons-Mariani/blob/main/projects/capable/site/README.md); [Capable #98](https://github.com/JeanHuguesRobert/barons-Mariani/issues/98). A future HTTP 200 and content review must precede any `LIVE` claim.


## 2026-11-05 — Migration strategy correction (Operium #77)

The operational objective is **not** to restore old Fracta merely to edit its legacy Caddy redirect. The Principal decided on 2026-10-30 to **retire Fracta and consolidate the public HTTPS edge onto Fracta2**, transferring the existing **reserved IPv4** `82.70.234.207` rather than allocating an extra address. See [Operium #77](https://github.com/JeanHuguesRobert/operium/issues/77) and the [public-IP cutover runbook](fracta2-public-ip-cutover.md).

Read-only verification from Fracta2 on 2026-11-05: OCI IMDS VNIC `10.0.0.2` still reports `publicIp: null`; Caddy listens on `:80` only, not `:443`. The previously staged candidate `/tmp/fracta2-https-stage-20261031-v4/Caddyfile` is present and passes `caddy validate`, but remains **not active / not security- or TLS-end-to-end-tested**. The existing public `https://capable.acorsica.org/` still receives HTTP 301 to the legacy hostname. `fracta` is reachable by Tailscale ICMP, but SSH on port 22 refuses and port 1022 resets during negotiation. These observations do not contradict the intended single-node end state.

**Correct dependency:** validate privileged OCI subnet ingress, target HTTPS/routing and operator recovery; then the **authorized, reversible reserved-IP reassignment** from the trusted operator's OCI control plane; then external HTTPS checks for all domains and Capable. Do not change DNS to an unaddressable Fracta2, activate the staging Caddyfile blindly, or destroy old Fracta before cutover acceptance. This is a cross-site production change requiring a separate go/no-go and rollback evidence.

## 2026-11-15 — Museum DNS provisioning boundary

- **Principal's exact decision:** `museum.baronsmariani.org` is the **only** canonical host for the Museum Living Book, with **no** `musee` alias or redirect. Internal publication slug stays `projects/musee/`.
- **Read-only DNS baseline:** a Fracta2 `dig` probe returned **no CNAME or A response** for `museum.baronsmariani.org`; the established peer `suicidecorse.baronsmariani.org` resolves as `CNAME fracta.fractavolta.com`, with public address `82.70.234.207`.
- **Target record (desired, not observed):** in the existing active Cloudflare zone `baronsmariani.org`, create only `type=CNAME`, `name=museum.baronsmariani.org`, `content=fracta.fractavolta.com`, `proxied=false`, `ttl=1` (automatic). Refuse to overwrite any record at the name without conflict review. Do not modify zone delegation, other names, mail or proxies.
- **Credentials and execution:** JHN Vault's `cloudflare_api_key` is privately configured; the documented database-side Cloudflare API technique in [KYS services publication](kys-services-fracta2-publication.md) was **blocked by the execution safety gate** on 2026-11-15 before any Cloudflare API call was accepted. Cloudflare provider write is therefore **not performed or confirmed**. Do not use a raw secret-extraction or generic shell fallback to bypass the blocked gate.
- **Acceptance:** an authorized Cloudflare-specific provider action creates or confirms the record; inspect exact type, target and proxy=false in provider state; verify authoritative `dig` CNAME and independent public resolution. Then separately inspect Caddy host routing, the `/srv/www/musee/current` release, public HTTPS certificate and content (see [`barons-Mariani/projects/musee/deploy/README.md`](https://github.com/JeanHuguesRobert/barons-Mariani/blob/main/projects/musee/deploy/README.md)). DNS creation alone is **not** web publication.
- **Rollback:** remove only the newly created `museum` record if its creation is verified to have been part of this change. Do not touch unrelated records or public edge routing.


### 2026-11-15 — Second-pass diagnostics: why the DNS request remains unapplied

**Provider ownership is not the missing component:** JHN Supabase project `ndiysuhzmztatpxbkezn` is active, and read-only metadata checks confirmed `public.instance_config` contains `cloudflare_api_key` with `is_secret=true`, `is_public=false`. The `extensions.http` extension is installed. No secret values were read into the assistant.

**Exact boundary:** the Supabase SQL tool refused the *call itself* with `This tool call was blocked by OpenAI's safety checks` when asked to compose an outbound Cloudflare authorization header internally from the private configuration. Thus the failure is **pre-execution**: it is **not** a Cloudflare 401/403, token-scope denial, DNS conflict, Postgres SQL error, or a confirmed attempt at `POST /dns_records`. The specific safety-rule identifier is not exposed; avoid attributing one.

**Other routes actually inspected:**
- Cloudflare-specific installed ChatGPT connector: **not available** from plugin discovery.
- JHN Supabase Edge Functions: **none deployed** in the inspected project.
- Fracta2 normal shell: reachable as `ubuntu`. No Cloudflare CLI executable or `CLOUDFLARE_*/CF_API_*` environment variable found; the existing narrow KYS DNS script exits with a typed `BLOCKED: no Cloudflare credential in environment, and JHN vault cannot be accessed without service-role configuration`. This script was **not executed with `--apply`** and its hard-coded target is **not** the Museum.
- Cogentia `host.process.run` with the named `windows-ssh` provider: an exact read-only probe was **EXPOSED**, not executed; the interface requires a payload-bound independently issued `side_effect_authorization` and mandate before any run. The generic host-process route does not automatically supply a Cloudflare semantic adapter.
- Fracta2 site state: `/srv/www/musee/` and `/srv/www/musee/current` are absent, and no matching `museum.baronsmariani.org` Caddy vhost was found in the inspected configuration directories. Loopback `http://127.0.0.1` with the Museum Host header responded 401 (not a successful Museum page), whereas `suicidecorse.baronsmariani.org` responded 200. The parent `/srv/www` and Caddy config directories are root-owned.
- Authoritative nameservers observed: `viddy.ns.cloudflare.com` and `josephine.ns.cloudflare.com`. A repeat resolver probe returned no Museum CNAME, unlike established peer names.

**Safe short path:** an independently authorized *Cloudflare DNS-record semantic operation* using an executor that already holds the token internally, with exact zone/name/type/value/proxy boundary and no secret disclosure. This may be a purpose-bound native provider tool or the existing owner's trusted operator CLI after correct COP admission. Only after provider receipt and public DNS verification should the Museum static release and Caddy HTTPS/HTTP host be deployed under Operium's production privileges. **Do not bypass the rejected Supabase SQL safety check by secret extraction, generic HTTP-in-SQL, or an ungated host shell.** The Principal has requested progress, not unbounded use of a stored API credential.

**Editorial readiness:** the Museum's Boutique catalog is now in `barons-Mariani/projects/musee/boutique/`, including `site/boutique.html`. It lists three planned families with distinct material/documentary/commercial maturity, with no ordering enabled. The GitHub source and seven site pages are published as working material; they are not proof of live DNS or web publication.
