---
title: "fracta Caddy vhost contract"
description: "Secret-free, applyable contract for public fractavolta.com Caddy virtual hosts."
document_role: "operational"
document_kind: "configuration-contract"
visibility: "public"
lifecycle_state: "active"
date: "2026-08-31"
related:
  - "fractavolta-dns.md"
  - "dns-provider-portability.md"
---

# fracta Caddy vhost contract

This is the versioned contract for the public virtual-host names served by
Caddy on `fracta`. It is not a copy of the live `/etc/caddy/Caddyfile`, which
may contain unrelated, node-local operational routing. Secrets and TLS private
keys are never represented here.

## DNS-to-vhost invariant

Any public hostname declared to resolve to `fracta.fractavolta.com` must be
either:

1. named by a Caddy site block that serves its intended route, or
2. intentionally redirected or rejected by an explicit Caddy rule.

A DNS CNAME alone is not HTTPS readiness: the requested hostname must be a
site name so Caddy can obtain and present a certificate for it.

## Required `fractavolta.com` aliases

The following names share the existing public `fracta` site behavior:

```caddyfile
fracta.fractavolta.com, www.fractavolta.com {
    # Preserve the existing public routes and upstream handlers here.
}
```

`www.fractavolta.com` is an alias, not a redirect target. The apex
`fractavolta.com` remains GitHub Pages and must not be added to this site block
unless its hosting responsibility is explicitly changed.

## Apply procedure

The node-local Caddyfile is changed only through an explicit operational
change. Before reload:

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.<change-id>
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

Then record evidence for every affected hostname:

```bash
curl --fail --head --max-time 15 https://<hostname>
```

For a new hostname, also confirm its public delegation and record the change
in the DNS reconciliation manifest before treating the site as ready.

## Rollback

Restore the named backup, validate it, reload Caddy, and re-run the affected
HTTPS checks. DNS, nameserver, Cloudflare proxy, registrar, and email-routing
changes are separate actions and are never implied by a Caddy rollback.

## Observation — 2026-08-31

The missing `www.fractavolta.com` Caddy alias was corrected on `fracta` before
this contract was recorded. Caddy validation, reload, and external HTTPS 200
with a certificate covering `www` were observed. This document records the
desired durable contract; it does not itself apply node configuration.
