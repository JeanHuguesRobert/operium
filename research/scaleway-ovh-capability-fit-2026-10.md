---
document_role: "source"
document_kind: "research"
visibility: "private"
created: "2026-10-07"
status: "active"
lifecycle_state: active
last_reviewed: "2026-10-07"
related:
  - "../profiles/dns-reconciliation.v1.json"
  - "../profiles/mail-role-profile.v1.json"
  - "../docs/secrets-management.md"
related_issue: "https://github.com/JeanHuguesRobert/operium/issues/37"
---

# Scaleway / OVHcloud — capability fit for the Operium stack

> Observation dated 2026-10-07. Prices and product limits are volatile. Re-check provider APIs/pages before any purchase or migration. This note is capability analysis, not purchasing authority.

## Executive finding

- Cloudflare remains authoritative DNS + inbound Email Routing + edge where already used.
- OCI Free Tier / existing Fracta nodes remain compute authority while free, healthy and sufficient.
- Scaleway is the preferred candidate for unsupported registrar TLDs such as .fr, and is also attractive for Transactional Email, Secret Manager, Object Storage / Glacier, low-volume Serverless, and optional observability.
- OVHcloud is a strong registrar fallback and has valuable bundled web/mail capacity, but much of that duplicates existing Cloudflare/Caddy/Fracta capabilities. OVH Cold Archive is notably attractive for deep archival storage.
- Principle: capability shopping, not provider consolidation.

## Corpus baseline

- fracta.fractavolta.com is documented as an OCI Free Tier VPS.
- Caddy on Fracta/Fracta2 already fronts several public services and static Living Book sites.
- Cloudflare is already the target/authority for DNS and inbound Email Routing on migrated domains.
- Secrets currently use a sovereign dual-authority model centered on inseme/.env plus application/runtime vault projections.
- Supabase / R2 / existing zero-cost storage patterns already exist in some application architecture.
- Mail sending is not yet represented as one canonical low-cost transactional provider across the estate.

Therefore: do not move working free compute merely to create provider uniformity.

## Capability matrix

| Capability | Current need / corpus fit | Scaleway | OVHcloud | Decision |
|---|---|---|---|---|
| Registrar for .fr | Immediate: Cloudflare Registrar rejects .fr with extension_not_supported | Registrar API supports search, transfer, contacts, renew state, DNSSEC | Mature domain/order/transfer API | Scaleway first choice, OVH fallback |
| Authoritative DNS | Already migrated to Cloudflare | Duplicate | Duplicate | Keep Cloudflare |
| Inbound mail aliases | Cloudflare Email Routing already validated | Not needed | Bundle mailbox(es), but duplicate | Keep Cloudflare |
| Transactional outbound email | Useful for agents, Living Books, forms, notices | Essential: 5 domains, 300 emails included/month, then €0.25/1000; API/SMTP/webhooks | No equally compelling simple low-volume fit identified in this pass | Pilot Scaleway TEM |
| Secret management | Strong fit for API keys, registrar credentials, runtime secrets | €0.04/version/month + €0.03/10k API calls; IAM | Secret/KMS capabilities exist | Pilot Scaleway Secret Manager as secondary/operational vault, not immediate replacement of sovereign authority |
| Low-volume serverless | Webhooks, callbacks, tiny APIs | Functions free tier: 400k GB-s + 1M requests/account/month; Containers/Jobs free tiers | No comparable low-volume advantage established here | Scaleway sandbox/pilot; no forced migration from free Fracta compute |
| Hot object storage | PDFs, releases, evidence blobs, backups | S3 compatible; One Zone ~€0.00803/GB/month; Multi-AZ ~€0.01606/GB/month; first 75GB egress/month free | S3-compatible Object Storage | Scaleway attractive for active object store |
| Deep archive | Evidence snapshots, immutable historical material | Glacier ~€0.00254/GB/month; restore ~€0.009/GB | Cold Archive from ~€0.0017/GB/month | Benchmark OVH Cold Archive vs Scaleway Glacier before bulk archival |
| Tiny VM | Only useful as redundancy/test node; current OCI compute is free | STARDUST1-S ~€0.43/month, limited supply | Discovery d2-2 ~€5.71 HT/month | Scaleway only as tiny witness/fallback node; do not replace OCI Free Tier |
| Observability | Operium can benefit from cheap external logs/metrics | Scaleway data included; custom logs/traces €0.35/GB, metrics €0.15/million | Broad monitoring stack | Optional Scaleway Cockpit pilot with strict ingestion caps |
| Bundled web hosting/mail | Mostly duplicate because Cloudflare + Caddy + Fracta already exist | Not primary advantage | Domain includes 100MB hosting + mailbox; paid hosting bundles more | Do not buy unless a specific isolated site/mailbox benefits |
| AI inference | Experimental / provider diversity | Generative API with free trial tier and batch discount | OVH AI endpoints also exist | Research only; keep model routing provider-neutral |

## Price sensitivity examples

### Secrets

- 10 live Scaleway secret versions: about €0.40/month storage before API calls.
- 25 live secret versions: about €1.00/month storage before API calls.
- Version churn must be controlled because billing is per stored version.

### Object storage

- 100 GB Scaleway One Zone: about €0.80/month.
- 100 GB Scaleway Multi-AZ: about €1.61/month.
- 100 GB Scaleway Glacier: about €0.25/month, plus restore when used.
- OVHcloud Cold Archive starts around €0.17/month per 100 GB, so it is a serious candidate for deep, rarely restored evidence archives.

### Compute

- Do not compare paid VM prices to the existing OCI node without valuing the existing €0 baseline.
- A Scaleway STARDUST instance at roughly €0.43/month is interesting as a minimal independent witness/probe/fallback node, not as a reason to displace healthy free compute.

## Recommended experiments

### P0 — Registrar adapter / lepp.fr

Implement a Scaleway registrar provider in Operium: search TLD/domain offer, transfer price, transfer initiation, status, expiry, auto-renew, EPP/lock, contacts, DNSSEC state. Keep Cloudflare nameservers unchanged during transfer.

### P1 — Transactional Email

Create one TEM pilot domain and route only application-originated mail through it. Do not replace Cloudflare inbound routing. Plan SPF/DKIM/DMARC explicitly and record webhook events. Candidate uses: Living Book guide acknowledgements, contact-form acknowledgements, agent notifications, operational alerts.

### P1 — Secret Manager bridge

Do not silently replace inseme/.env or the documented vault. Build an Operium adapter with dry-run inventory, explicit push/pull, never-print-secret invariant, version/cost estimate, per-secret IAM, and auditable rotation. Start with non-critical test credentials.

### P1 — Evidence Object Store

Pilot one S3-compatible bucket for published PDFs, hashes/manifests, screenshots/evidence copies, and build outputs that should survive a VPS loss. Desired invariants: content-addressed or immutable naming, SHA-256 manifest, lifecycle hot-to-archive, provider-independent S3 client, provenance metadata outside the provider.

### P2 — Tiny independent node

If available, a STARDUST-class node can be useful as an external health probe, independent DNS/HTTP observer, webhook relay, or minimal Fractanet witness. It must not become a hidden single point of failure.

### P2 — Cockpit

Use only after defining ingestion budgets. Custom external logs can be cheap, but an unbounded logger is an avoidable bill risk.

## Provider-selection policy

For each capability: preserve a working zero-cost incumbent unless there is a concrete defect; compare API quality + price + exit path; choose the smallest independently useful service; expose it behind an Operium provider adapter; keep metadata/evidence provider-neutral; require explicit authorization before paid expansion.

For registrars: prefer Cloudflare when the TLD is supported and price/API are acceptable; otherwise prefer Scaleway when TLD + API support are good; keep OVHcloud as a mature fallback.

## Immediate conclusion for lepp.fr

The best next experiment is Scaleway registrar only. Do not bundle DNS, inbound mail or hosting into the transfer: DNS remains Cloudflare, inbound mail remains Cloudflare Email Routing, and existing hosting remains where it is. Once the Scaleway account/API surface is validated, separately evaluate TEM, Secret Manager and Object Storage.

## Current provider references checked 2026-10-07

- Scaleway Registrar API: https://www.scaleway.com/en/developers/api/domains-and-dns/registrar
- Scaleway Serverless pricing: https://www.scaleway.com/fr/tarifs/serverless/
- Scaleway Object Storage pricing: https://www.scaleway.com/fr/tarifs/storage/
- Scaleway Secret Manager pricing: https://www.scaleway.com/fr/tarifs/security-and-account/
- Scaleway Cockpit pricing: https://www.scaleway.com/fr/tarifs/managed-services/
- Scaleway Transactional Email: https://www.scaleway.com/fr/transactional-email-tem/
- Scaleway Virtual Instances pricing: https://www.scaleway.com/fr/tarifs/virtual-instances/
- OVHcloud .fr pricing/bundle: https://www.ovhcloud.com/fr/domains/tld/fr/
- OVHcloud domain transfer API guide: https://docs.ovhcloud.com/fr/guides/web-cloud/domains/api-domain-transfer
- OVHcloud Public Cloud pricing: https://www.ovhcloud.com/fr/public-cloud/prices/
- OVHcloud Cold Archive: https://www.ovhcloud.com/fr/public-cloud/cold-archive/


## CLI validation — 2026-10-07

Scaleway CLI 2.63.0 exposes the Registrar API natively under `domain`.

Observed command surface:
- `domain domain search` — exact/strict domain search;
- `domain tld list` — TLD offers;
- `domain order transfer` — inbound registrar transfer;
- `domain task list-inbound-transfers` — transfer tracking;
- transfer accepts existing owner/administrative/technical contact IDs, avoiding duplication of personal data in shell commands.

Operium policy for Scaleway is therefore **official CLI first**, direct REST only when a required capability is missing from the CLI. Secrets remain local/out-of-band and must never be committed or printed.
