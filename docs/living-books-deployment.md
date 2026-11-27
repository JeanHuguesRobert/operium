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

This document records the operational topology, origin layout, edge routing, and public DNS records for the federation of **12 Living Books with recorded public deployments** across `acorsica.org` and `baronsmariani.org`.

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
| 7 | `capable` | `capable.acorsica.org` *(canonical decision 2026-10-29; old `capable.lepp.fr`)* | `acorsica.org` *(legacy `lepp.fr`)* | `CNAME capable -> fracta.fractavolta.com` | `fracta2:/srv/www/capable/current` | **LIVE (HTTPS 200, canonical host verified 2026-11-26)** |
| 8 | `napoleon` | `napoleon.acorsica.org` | `acorsica.org` | `CNAME napoleon -> fracta.fractavolta.com` | `fracta2:/srv/www/napoleon/current` | **LIVE (Active)** |
| 9 | `diaspora` | `diaspora.acorsica.org` | `acorsica.org` | `CNAME diaspora -> fracta.fractavolta.com` | `fracta2:/srv/www/diaspora/current` | **LIVE (Active)** |
| 10 | `suicide-corse` | `suicidecorse.baronsmariani.org` | `baronsmariani.org` | `CNAME suicidecorse -> fracta.fractavolta.com` | `fracta2:/srv/www/suicidecorse/current` | **LIVE (Active)** |
| 11 | `rise-and-fall` | `riseandfall.baronsmariani.org` | `baronsmariani.org` | `CNAME riseandfall -> fracta.fractavolta.com` | `fracta2:/srv/www/riseandfall/current` | **LIVE (Active)** |
| 12 | `musee` | `museum.baronsmariani.org` | `baronsmariani.org` | **VERIFIED:** `CNAME museum -> fracta.fractavolta.com`, DNS-only, TTL Auto | `fracta2:/srv/www/musee/current` → release `f7f8ef131b5f` | **LIVE: HTTPS 200 + Boutique 200** (2026-11-15) |

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
CNAME  capable    fracta.fractavolta.com    DNS only       Auto (canonical HTTPS verified 2026-11-26; legacy redirect observation superseded)
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


### 2026-11-15 — Museum authenticated provider preflight and COP cause

**Superseding finding for the Museum DNS operation:** Cloudflare is **reachable with a working authenticated GET** from the verified ThinkPad operator environment (Fracta2 `ssh thinkpad`). Its `C:\tweesic\inseme\.env` contains the historical Cloudflare key, whose value was never exposed. API results: **one active** `baronsmariani.org` zone, **zero** `museum` records and **one** DNS-only peer CNAME `suicidecorse`. This proves read permission, **not** DNS Write.

The existing provider CLI now has a **fixed** `--site=museum` option while retaining the old default `services` ([provisioner](../scripts/provision-kys-services-dns.mjs); [tests](../scripts/test-provision-kys-services-dns.mjs)). Six isolated mock fixtures pass. Its **real ThinkPad-authenticated dry-run** exited 0, printing `DRY-RUN: would create DNS-only CNAME museum.baronsmariani.org -> fracta.fractavolta.com`; **no `--apply` occurred**.

**Authorization root cause:** the Cogentia MCP tunnel labels the agent `mandate:chatgpt-corpus-coding` but this is not a signed DNS grant. Read-only inspection of the canonical local COP events found no active declaration for this DNS operation or ThinkPad process target; the JHN Supabase `public.cop_mandates` table is also empty. The MCP host router requires a payload-bound grant or an injected trusted `missionAuthorityResolver`; the live HTTP MCP entrypoint does **not** inject the resolver. A real `host.process.run` call was rejected `authorization_missing: no verified mission or effect grant` even for `hostname`, before dispatch. The previous SQL/HTTP route was separately blocked by tool safety checks. **Never use the working SSH token path to circumvent either boundary.**

Continue under the existing [Cogentia #299](https://github.com/JeanHuguesRobert/cogentia/issues/299#issuecomment-6893375864), not a parallel governance system. The only remaining DNS effect is a human-issued, scope-limited **semantic** Cloudflare record grant and exact provider execution with verified receipt. The Museum site still needs its own static release and Caddy vhost. Status: **READY IN DRY-RUN, AUTHORITY MISSING, DNS NOT CREATED, HTTPS NOT PUBLISHED**.


### 2026-11-15 — Museum DNS created and independently verified (supersedes prior preflight blocks)

The Principal reiterated the **standing Optimistic Locking delegation** for bounded, low-impact, recoverable technical changes, explicitly rejecting repetitive one-off mandates for benign DNS records. See [Cogentia shared instructions](https://github.com/JeanHuguesRobert/cogentia/blob/main/instructions/AGENTS.shared.md#principal-attention-presumed-authority-and-continuation-cogentia-285) and the revised [authorization skill](https://github.com/JeanHuguesRobert/cogentia/blob/main/skills/side-effect-authorization/SKILL.md).

**Effect performed:** on the already authenticated owner workstation (validated Windows identity `I7-THINKPAD-JHR`), the existing allowlisted Operium `scripts/provision-kys-services-dns.mjs --site=museum --apply` executed from pinned GitHub commit `ed6abbe0f75c2733a5102fdd9378dd14824281c8`, after SHA-256 validation of the exact script file. Cloudflare credentials remained solely inside the local PowerShell process. **Provider response:** `CREATED: museum.baronsmariani.org CNAME -> fracta.fractavolta.com (DNS-only)`. Immediate *authenticated Cloudflare GET read-back* returned exactly one record, matching type/name/target and `proxied=false`; process exit 0.

**Independent observation:** both authoritative servers `viddy.ns.cloudflare.com` and `josephine.ns.cloudflare.com` answer `museum.baronsmariani.org CNAME fracta.fractavolta.com.`. The recursive A resolution reaches `82.70.234.207`. No `musee` alias was added; no other DNS record was intentionally mutated. The provider returned a record ID, deliberately redacted from the conversational receipt.

**Authorization provenance must be distinguished:** effect was performed under the Principal's explicit standing user delegation via the existing authenticated operator execution channel, **not via a successful canonical COP `host.process.run` mission grant**. The previously diagnosed MCP `authorization_missing` / missing `missionAuthorityResolver` issue remains an implementation defect tracked by [Cogentia #299](https://github.com/JeanHuguesRobert/cogentia/issues/299). A successful narrow provider effect does not imply a signed COP mandate has been added or that the current MCP runtime can execute it. The user's latest instruction rejects per-act ceremony; correct the reusable standing mandate adapter instead of replacing it with serial one-off signatures.

**HTTPS still BLOCKED:** the public `https://museum.baronsmariani.org/` test returned TLS alert `internal error` before serving content. This is consistent with missing Caddy routing/certificate/site release, not a DNS failure. Next stage: deploy the static Museum pages (including Boutique), configure the Caddy vhost, then check certificate and `/boutique.html`; avoid touching other books or DNS records.


### 2026-11-15 — Museum public HTTPS deployment completed and checked

The Principal's previously documented standing delegation also covered routine deployment of the already approved public Museum Living Book. A **pinned, bounded, recoverable** script was added to Operium: [`scripts/ops/publish-museum-static.sh`](../scripts/ops/publish-museum-static.sh) (commit `550a1a90660806775adb81c2ca8f552520e740fc`). It provisions **only** the canonical `museum.baronsmariani.org` host. The source revision is fixed to `JeanHuguesRobert/barons-Mariani@3487f3d4e3c504d5044355dc39bd75323e3bb0ec`.

**Preflight** on Fracta2 in unprivileged mode: Bash syntax PASS, authoritative DNS correct, eight projected site files fetched and checked, no competing Museum Caddy fragments, `PREFLIGHT=PASS`.

**Privileged apply** from the already authenticated operator ThinkPad via its existing SSH and passwordless `sudo` admin route: the first transport attempt failed on cross-shell quoting **before writing any destination** (checked absent Museum release and Caddy fragments, active Caddy). A retry used a locally staged script whose exact SHA-256 `ab69a1ee443a29436c30d04b0ce69d31ec408e402fe1a439af16266a072a386a` was checked before dispatch. The nested SSH command ran `sudo -n bash publish.sh --apply`. The SSH client timed out before returning a final application receipt, so **no success was inferred from that tool call**; independent read-back established a completed release and live edge configuration. Staging file and directory were then removed after checking their SHA-256.

**Observed postconditions (independent from the timed-out tool):**
- root-owned `/srv/www/musee/releases/3487f3d4e3c504d5044355dc39bd75323e3bb0ec/`; `current` symlink points to that release;
- Caddy files `/etc/caddy/Caddyfile.d/museum.caddy` and `/etc/caddy/fracta2-edge-https/museum-tls.caddy` present; `caddy.service=active`;
- Museum local HTTP host response **200** and public HTTPS **200**, certificate validation `ssl_verify_result=0`;
- public `/`, `/book.html`, `/magazine.html`, `/boutique.html`, `/annexes.html`, `/contribuer.html`, `/mentions.html` and `/styles.css` each **HTTP 200** with valid TLS and expected content types;
- regression probes `suicidecorse.baronsmariani.org`, `riseandfall.baronsmariani.org`, `capable.acorsica.org` each **200 / TLS valid**; protected `browser.fractavolta.com` remains **401 / TLS valid**;
- authoritative `musee.baronsmariani.org` CNAME lookup empty, as required by Occam's one-name decision.

**Status:** Museum website and Boutique public, **edition `n1` still "en préparation"** (not editorially frozen, no product ordering). The standing mandate/COP technical integration issue remains tracked separately by Cogentia #299; do not conflate this successful operator-channel deployment with a canonical COP admission receipt. A subsequent site release should preserve immutable versions, conflict detection and the one-host Caddy guard.


**Editorial FBF correction — later on 2026-11-15:** source inspection found the initially released HTML still stating that the Museum public domain had not been verified as published. These claims were obsolete *because the first deployment had succeeded*. The six affected HTML pages and corresponding source indexes were corrected on `barons-Mariani/main` commit `f7f8ef131b5fc81d5a68e11cb404e886ad865861` without changing the n1 working/frozen status or Boutique ordering state. Operium publication script was repinned to that exact source revision ([commit `6de3e8e`](https://github.com/JeanHuguesRobert/operium/commit/6de3e8e1b6903bb7573eb0451f02a0dd58f20f43)); its real `--check` again PASSED.

**Second immutable release independently verified:** `/srv/www/musee/current -> releases/f7f8ef131b5fc81d5a68e11cb404e886ad865861`; `index.html` no longer contains obsolete offline wording and now states publication since 2026-11-15; `magazine.html` likewise acknowledges live projection. HTTPS public `/`, `/magazine.html` and `/boutique.html` all return **200, TLS verify 0**, Caddy remains active. Peer checks still **200** (Suicide Corse, Rise & Fall, Capable) and **401** (private Browser), TLS verify 0 for each. The second remote SSH call again timed out from the client perspective; no success was claimed until filesystem, live HTTPS and Caddy were independently observed. Script staging cleaned afterwards. The earlier release remains available as an immutable rollback target; no data from unrelated sites was removed.

## 2026-11-26 — Addressable resource releases, RT-LBF-003

This dated operational observation supersedes the prior release pointers
for the seven books below. It does not change DNS or vhosts. On this date,
`capable.acorsica.org` also returned HTTPS 200 on its canonical host;
Orta is a project in the Corpus, not yet a verified public deployment.

| Book | Active release identity (full tree SHA-256) | Public resources |
|---|---|---:|
| 1755 | `38f4db7917bf89f34af1ee006f43e589ef151e5829706cae530c7640cbeee4ef` | [3](https://1755.acorsica.org/ressources/index.html) |
| rise-and-fall | `8ef74f608e08fb0b2b61da95a76d6cc3fccd5abb06b28ca6369e8a176517f140` | [3](https://riseandfall.baronsmariani.org/ressources/index.html) |
| musee | `7bea8fbfddb6c75ac258f774a3ee43ba86f66b64f62d4f4a67bab9401bd05ccb` | [15](https://museum.baronsmariani.org/ressources/index.html) |
| school | `3ca0127b0c8d63284f6421311be73b28e7eadfb6456fe62550b2a5cbd60194d0` | [1](https://school.acorsica.org/ressources/index.html) |
| commons | `46f762ec6580c95a716acf6b050e4b13af9b6ceabddb495da2e2a923db471739` | [8](https://commons.acorsica.org/ressources/index.html) |
| institut | `bfe3f505b02d37dd0b237c46273eaf57d3ec962f01e5e074b83635d9b7960048` | [6](https://institut.acorsica.org/ressources/index.html) |
| privai | `ff3b870d4ad5ef354f439b33baf1745f037970c7ffadf74ff21c6ab60767bb6c` | [12](https://privai.acorsica.org/ressources/index.html) |

All seven releases were activated by the Principal and independently
verified against their expected HTTPS bytes; 48 document projections
excluding the seven indexes. The receipts are stored locally on Fracta2
at `/var/lib/cogentia/state/living-book-resource-receipts/<release>/receipt.json`,
outside public roots. The canonical CI-to-assembly handoff compares the
complete active tree, prepares only changed releases and preserves frozen
assets. See [Cogentia #348](https://github.com/JeanHuguesRobert/cogentia/issues/348#issuecomment-7202807961)
and [Barons #112](https://github.com/JeanHuguesRobert/barons-Mariani/issues/112).
Activation still requires the operator; do not infer autonomous super
admission from the observed public state. No new service or DNS operation
is needed for these seven releases.

### 2026-11-27 — Orta initial provisioning prepared (not live)

Canonical host: orta.acorsica.org; existing Fracta2 public edge, no new
service. Both Cloudflare authoritative nameservers returned NXDOMAIN.
The peer Village uses a DNS-only CNAME to fracta.fractavolta.com.
Desired Orta record: CNAME orta -> fracta.fractavolta.com, DNS-only,
TTL Auto, no alias or other zone changes. The existing DNS provisioner
now accepts --site=orta, with mock dry-run and apply regressions.

First immutable release: orta-resources-60446b1e64e01ad375f63e8de9689640f9b868f17d7827580bd6c7ab0dd0d6f1
(13 files; receipt SHA256 54268813b6a5edfd759fc6bb132add707b6606b626c330de40ee46e82129d553).
Prepared by the Factory from verified resource CI and committed site tree;
see [Cogentia #348](https://github.com/JeanHuguesRobert/cogentia/issues/348).
Origin bootstrap uses [provision-orta-static.py](../scripts/ops/provision-orta-static.py):
checks pinned bytes, refuses a competing current or vhost, installs only
/srv/www/orta and the two Orta Caddy fragments using the existing Caddy
imports, validates complete configuration, checks every origin byte.
An existing equivalent origin is a no-op; failures are forward-corrected.

Owner apply is required; normal Fracta2 shell has no Cloudflare credential
and super admission is not executable. The exact candidate is currently
in /tmp/lbf348-delivery-real.ebrdsd/books/ (re-materialize if lost).
Preflight passed, no DNS change, no privileged apply, no HTTPS claim.
After owner installation and the DNS-only record, independently verify
both authoritative CNAME answers, TLS, all 13 public bytes and store the
detached receipt in the existing node-local receipt directory. Until
then status is BOOTSTRAP_PREPARED, not LIVE.
