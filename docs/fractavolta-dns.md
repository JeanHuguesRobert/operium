---
title: "fractavolta.com DNS zone (Gandi)"
description: "Observed DNS records for fractavolta.com — fracta OCI VPS, GitHub Pages apex, Gandi mail, service CNAMEs."
layout: default
date: 2026-07-04
last_modified_at: 2026-07-04
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/fractavolta-dns.md
document_role: "operational"
document_kind: "reference"
visibility: "public"
lifecycle_state: "active"
status: "observed zone export — 2026-07-04"
---

# fractavolta.com DNS zone (Gandi)

This note records the **observed DNS zone** for `fractavolta.com`, as exported from Gandi.
It belongs in **Operium** (infrastructure memory).

Companion notes:

- [Fracta trust perimeter and secrets](fracta-trust-perimeter.md) — VPS role, `guide.env`, Caddy
- [Fractanet mesh — Tailscale and SSH](fractanet-mesh.md) — Tailscale vs public IP access

**Registrar / DNS host:** Gandi (`ns1.gandi.net`, SOA serial `1783010296` at observation).

---

## Summary

| Target | Role |
|--------|------|
| Apex `@` (`fractavolta.com`) | **GitHub Pages** — four A records `185.199.108–111.153` |
| `fracta.fractavolta.com` | **OCI Free Tier VPS** — A `82.70.234.207` |
| `*.fractavolta.com` (most app hosts) | CNAME → `fracta.fractavolta.com` (Caddy reverse proxy on VPS) |
| Mail | Gandi (`spool.mail.gandi.net`, `fb.mail.gandi.net`, DKIM, webmail) |

Routine **operator SSH** to the VPS uses the public IP `82.70.234.207` (alias `fracta-public`) or Tailscale — see [fractanet-mesh.md](fractanet-mesh.md). Visitor HTTPS hits CNAMEs that resolve to this IP via `fracta.fractavolta.com`.

---

## Apex and mail (Gandi)

```text
@           SOA   ns1.gandi.net. hostmaster.gandi.net.
@           A     185.199.108.153
@           A     185.199.109.153
@           A     185.199.110.153
@           A     185.199.111.153
@           MX    10 spool.mail.gandi.net.
@           MX    50 fb.mail.gandi.net.
@           TXT   v=spf1 include:_mailcust.gandi.net ?all
webmail     CNAME webmail.gandi.net.
gm1._domainkey  CNAME gm1.gandimail.net.
gm2._domainkey  CNAME gm2.gandimail.net.
gm3._domainkey  CNAME gm3.gandimail.net.
_imaps._tcp     SRV   0 1 993 mail.gandi.net.
_pop3s._tcp     SRV   10 1 995 mail.gandi.net.
_submission._tcp SRV  0 1 465 mail.gandi.net.
_imap._tcp      SRV   0 0 0 .
_pop3._tcp      SRV   0 0 0 .
mailsa          TXT   dccc24c423a220b87bab1ef5a6b4e7fb634e6b567852b2287a1b041898c24b1f
```

The apex points at **GitHub Pages**, not the fracta VPS. Project sites on `*.github.io` may use dedicated records (see exceptions below).

---

## fracta VPS (Oracle Cloud Free Tier)

```text
fracta.fractavolta.com.   300   IN   A   82.70.234.207
www.fractavolta.com.      10800 IN   CNAME fracta.fractavolta.com.
```

This is the **public IPv4** of the fracta node. Caddy terminates TLS for HTTPS vhosts that CNAME here.

---

## Application hosts → fracta (CNAME, TTL 300)

All resolve to `fracta.fractavolta.com` → `82.70.234.207`:

| Host | FQDN |
|------|------|
| auxilia | `auxilia.fractavolta.com` |
| cogentia | `cogentia.fractavolta.com` |
| commons.cogentia | `commons.cogentia.fractavolta.com` |
| cop | `cop.fractavolta.com` |
| corsica | `corsica.fractavolta.com` |
| cyrnea | `cyrnea.fractavolta.com` |
| inox | `inox.fractavolta.com` |
| inseme | `inseme.fractavolta.com` |
| kudocracy | `kudocracy.fractavolta.com` |
| magistral | `magistral.fractavolta.com` |
| net | `net.fractavolta.com` |
| ophelia | `ophelia.fractavolta.com` |
| personal.cogentia | `personal.cogentia.fractavolta.com` |
| platform | `platform.fractavolta.com` |
| rhuma | `rhuma.fractavolta.com` |
| simpliwiki | `simpliwiki.fractavolta.com` |
| vigilia | `vigilia.fractavolta.com` |

**Production Cogentia Guide** (blackboard, public face): `https://cogentia.fractavolta.com`.

---

## Exceptions (not on fracta VPS)

| Host | Record | Target | Note |
|------|--------|--------|------|
| `congentia` | CNAME (TTL 10800) | `webredir.gandi.net` | Likely typo redirect; not `cogentia` |
| `marenostrum` | CNAME (TTL 10800) | `webredir.gandi.net` | Gandi web redirect |
| `paese-capace` | CNAME (TTL 10800) | `jeanhuguesrobert.github.io` | GitHub Pages project site |

---

## Raw zone export (observed 2026-07-04)

For diffing on future changes:

```text
@ 86400 IN SOA ns1.gandi.net. hostmaster.gandi.net. 1783010296 10800 3600 604800 10800
@ 10800 IN A 185.199.108.153
@ 10800 IN A 185.199.109.153
@ 10800 IN A 185.199.110.153
@ 10800 IN A 185.199.111.153
@ 10800 IN MX 10 spool.mail.gandi.net.
@ 10800 IN MX 50 fb.mail.gandi.net.
@ 10800 IN TXT "v=spf1 include:_mailcust.gandi.net ?all"
_imap._tcp 10800 IN SRV 0 0 0 .
_imaps._tcp 10800 IN SRV 0 1 993 mail.gandi.net.
_pop3._tcp 10800 IN SRV 0 0 0 .
_pop3s._tcp 10800 IN SRV 10 1 995 mail.gandi.net.
_submission._tcp 10800 IN SRV 0 1 465 mail.gandi.net.
auxilia 300 IN CNAME fracta.fractavolta.com.
cogentia 300 IN CNAME fracta.fractavolta.com.
commons.cogentia 300 IN CNAME fracta.fractavolta.com.
congentia 10800 IN CNAME webredir.gandi.net.
cop 300 IN CNAME fracta.fractavolta.com.
corsica 300 IN CNAME fracta.fractavolta.com.
cyrnea 300 IN CNAME fracta.fractavolta.com.
fracta 300 IN A 82.70.234.207
gm1._domainkey 10800 IN CNAME gm1.gandimail.net.
gm2._domainkey 10800 IN CNAME gm2.gandimail.net.
gm3._domainkey 10800 IN CNAME gm3.gandimail.net.
inox 300 IN CNAME fracta.fractavolta.com.
inseme 300 IN CNAME fracta.fractavolta.com.
kudocracy 300 IN CNAME fracta.fractavolta.com.
magistral 300 IN CNAME fracta.fractavolta.com.
mailsa 10800 IN TXT "dccc24c423a220b87bab1ef5a6b4e7fb634e6b567852b2287a1b041898c24b1f"
marenostrum 10800 IN CNAME webredir.gandi.net.
net 300 IN CNAME fracta.fractavolta.com.
ophelia 300 IN CNAME fracta.fractavolta.com.
paese-capace 10800 IN CNAME jeanhuguesrobert.github.io.
personal.cogentia 300 IN CNAME fracta.fractavolta.com.
platform 300 IN CNAME fracta.fractavolta.com.
rhuma 300 IN CNAME fracta.fractavolta.com.
simpliwiki 300 IN CNAME fracta.fractavolta.com.
vigilia 300 IN CNAME fracta.fractavolta.com.
webmail 10800 IN CNAME webmail.gandi.net.
www 10800 IN CNAME fracta.fractavolta.com.
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-04 | Initial record from Gandi zone export (operator-provided) |