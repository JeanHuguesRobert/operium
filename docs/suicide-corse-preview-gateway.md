---
title: Suicide Corse preview gateway
description: Secret-free operational contract for the public Suicide Corse preview served through Fracta and Fracta2.
document_role: operational
document_kind: configuration-contract
visibility: public
lifecycle_state: active
date: '2026-09-17'
related:
  - fractavolta-caddy-contract.md
  - fractanet-mesh.md
  - dns-provider-portability.md
classification_source: cogentia.js
classification_version: '1'
classification_rule: explicit-metadata
classification_confidence: medium
license: CC BY-SA 4.0
affiliation: Institut Mariani / C.O.R.S.I.C.A., 1 cours Paoli, F-20250 Corte, Corsica
language: en
update_policy: UP-DEFAULT-REVIEWED
status: working-paper
review:
  status: unreviewed
  reviewed_by: []
provenance:
  origin_type: operator-observation
  origin_repository: JeanHuguesRobert/operium
  origin_ref: 2026-09-17-suicide-corse-preview-gateway
  origin_date: '2026-09-17'
  derived_from:
    - docs/fractavolta-caddy-contract.md
    - docs/fractanet-mesh.md
---

# Suicide Corse preview gateway

## Purpose and boundary

`https://suicidecorse.baronsmariani.org` is a publicly reachable **preview**
of rendered Suicide Corse artifacts. Public reachability does not change the
edition's editorial status: its publication manifest remains `draft` while
new, provenance-bearing projections are expected.

This note records the operational contract, not the editorial source or the
node-local Caddyfiles. It contains no secret, private mesh address, credential,
or TLS key.

## Observed topology — 2026-09-17

```text
Public Internet
  -> Cloudflare DNS-only CNAME
  -> fracta.fractavolta.com
  -> Fracta Caddy: TLS termination and named Suicide Corse vhost
  -> authenticated Fractanet mesh transport
  -> Fracta2 Caddy: HTTP static-artifact origin
```

Fracta2 deliberately has no public web ingress for this product. Its origin
HTTP is confined to the mesh; TLS is terminated by Fracta. This reuses the
existing public-gateway pattern and avoids widening Fracta2's Internet exposure.

The static artifact repository is `JeanHuguesRobert/suicide-corse`. The source
Corpus remains separate in `JeanHuguesRobert/barons-Mariani`.

## DNS and vhost invariant

The Cloudflare record for `suicidecorse.baronsmariani.org` is DNS-only and
aliases `fracta.fractavolta.com`. The Fracta Caddyfile must therefore contain a
named `suicidecorse.baronsmariani.org` site block. That block reverse-proxies
only to the Fracta2 static origin over the mesh.

The Fracta2 Caddyfile must name the same host as an explicit HTTP-only origin.
It must not request a public certificate or redirect that mesh-origin request
back to HTTPS.

## Apply and verification procedure

For an artifact refresh:

1. Start with clean, recorded revisions of both the Corpus and renderer. From
   the `ubikia` checkout, render a new output directory explicitly:

   ```bash
   npm run render -- --corpus ../barons-Mariani/projects/suicide-corse/corpus.yml --projection ../barons-Mariani/projects/suicide-corse/projections/book-2026-09-17-anniversaire.yml --output /path/to/new-render
   ```

   This renderer produces a draft, traceable output; it does not authorize a
   publication.
2. Inspect the generated `manifest.json`, HTML, and PDF. Record the Corpus
   source commit and retain the manifest with the release.
3. Copy the rendered book files and manifest into a *new*, dated directory in
   the separate `JeanHuguesRobert/suicide-corse` artifact repository. Preserve
   the landing page and do not replace a prior edition in place.
4. Place that complete artifact set in a new release directory on Fracta2 and
   verify it through the mesh.
5. Atomically promote the release pointer only after those checks pass.
6. Verify the public HTTPS endpoints through Fracta. A server promotion is a
   separate, explicit operational authorization.

Before a Caddy change, back up the affected node-local Caddyfile, validate it,
and reload only after validation. See
[the Fracta Caddy vhost contract](fractavolta-caddy-contract.md).

Minimum public smoke checks:

```bash
curl --fail --head --max-time 15 https://suicidecorse.baronsmariani.org/
curl --fail --head --max-time 15 https://suicidecorse.baronsmariani.org/editions/2026-09-17/index.html
curl --fail --head --max-time 15 https://suicidecorse.baronsmariani.org/editions/2026-09-17/suicide-corse-edition-2026-09-17-anniversaire.pdf
curl --fail --head --max-time 15 https://suicidecorse.baronsmariani.org/editions/2026-09-17/manifest.json
```

From a Windows operator workstation, the same checks plus manifest/PDF hash
verification are available as one command:

```powershell
pwsh -NoProfile -File scripts/ops/check-suicide-corse-preview.ps1
```

The downloaded PDF hash must match the PDF hash declared in that release's
manifest before treating the preview as verified.

## Recovery

If Fracta cannot reach the Fracta2 origin, preserve the failing evidence and
inspect the mesh route and origin health before changing DNS. If a Caddy change
is implicated, restore the corresponding node-local backup, validate, reload,
and repeat the smoke checks.

DNS rollback is a separate, explicitly authorized action. It must restore a
known previous Cloudflare record rather than infer a target from stale notes.

## Observed evidence

On 2026-09-17, Caddy obtained a Let's Encrypt certificate for the public host.
External HTTPS checks returned `200` for the landing page, edition HTML, PDF,
and provenance manifest. The PDF SHA-256 matched the manifest value for source
commit `17ed8aa4907233e005c840842fc8da95645e066b`.

## Known constraints

- The preview is intentionally editable through new traceable projections; it
  is not an editorially finalized edition.
- Fracta is the public TLS and availability dependency for this route.
- Fracta2 public-network security rules are not part of this product's serving
  path and should not be opened merely for the preview.
