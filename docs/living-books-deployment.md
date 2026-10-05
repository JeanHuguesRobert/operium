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
| 7 | `capable` | `capable.lepp.fr` *(alias `capable.acorsica.org`)* | `lepp.fr` *(and `acorsica.org`)* | `CNAME capable -> fracta.fractavolta.com` | `fracta2:/srv/www/capable/current` | **LIVE (Active)** |
| 8 | `napoleon` | `napoleon.acorsica.org` | `acorsica.org` | `CNAME napoleon -> fracta.fractavolta.com` | `fracta2:/srv/www/napoleon/current` | **LIVE (Active)** |
| 9 | `diaspora` | `diaspora.acorsica.org` | `acorsica.org` | `CNAME diaspora -> fracta.fractavolta.com` | `fracta2:/srv/www/diaspora/current` | **LIVE (Active)** |
| 10 | `suicide-corse` | `suicidecorse.baronsmariani.org` | `baronsmariani.org` | `CNAME suicidecorse -> fracta.fractavolta.com` | `fracta2:/srv/www/suicidecorse/current` | **LIVE (Active)** |
| 11 | `rise-and-fall` | `riseandfall.baronsmariani.org` | `baronsmariani.org` | `CNAME riseandfall -> fracta.fractavolta.com` | `fracta2:/srv/www/riseandfall/current` | **LIVE (Active)** |

---

## 3. Authoritative DNS Records (Cloudflare)

The authoritative DNS records are hosted on Cloudflare with proxy mode disabled (DNS-only / grey cloud) to allow direct ACME challenge resolution by `fracta`:

### Zone `lepp.fr`
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
CNAME  capable    fracta.fractavolta.com    DNS only       Auto (redirects 301 to capable.lepp.fr)
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
