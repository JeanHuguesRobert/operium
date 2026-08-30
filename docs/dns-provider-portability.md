---
title: "DNS Provider Portability and Reversible Migration"
description: "A provider-neutral operational model for authoritative DNS, controlled migration, and verified return paths."
document_role: operational
document_kind: architecture-note
visibility: public
lifecycle_state: working
update_policy: UP-INFRASTRUCTURE-HEALTH
language: en
date: "2026-08-29"
last_modified_at: "2026-08-30"
related:
  - "fractavolta-dns.md"
  - "fractanet-mesh.md"
---

# DNS Provider Portability and Reversible Migration

## Purpose

Authoritative DNS is an operational dependency, not merely a registrar
setting. This note defines how Operium records and governs that dependency
when a domain moves between DNS providers.

The objective is not provider avoidance. It is a **chosen, observable, and
reversible dependency**: a provider may add edge, security, and automation
capabilities while the domain owner retains a tested route to export, compare,
and return.

## Boundary

This capability applies independently to each domain:

```text
registrar
  != authoritative DNS provider
  != edge/security provider
  != origin host
```

Secrets, API-token values, browser profiles, and end-user identities are never
stored in this repository. Operium records only provider names, secret
references, observed state, and verification evidence.

## Domain control record

For every managed domain, maintain a control record with these fields:

| Field | Meaning |
|---|---|
| Registrar | Contractual holder and nameserver-change authority. |
| Active authoritative DNS | Provider currently answering public DNS. |
| Standby DNS | A provider with an exportable, verified return path. |
| Edge mode | DNS-only, reverse proxy, or tunnel-backed public edge. |
| Desired zone | Versioned, non-secret declaration of intended records. |
| Provider snapshots | Dated, provider-native recovery evidence. |
| Migration state | `source`, `mirror-verified`, `pending`, `active`, `returning`, or `failed`. |
| DNSSEC state | Explicitly recorded before a nameserver transition. |

## Provider-neutral operations

Every adapter must support the same operational ladder:

```text
export -> normalize -> diff -> dry-run -> apply -> resolve -> service-verify
                                      \-> snapshot -> return-verify
```

`apply` is an explicit, human-authorized action. A successful API response is
not sufficient evidence: public authoritative answers and each dependent
service must be checked after propagation.

## Current providers

### Gandi LiveDNS

Gandi LiveDNS is a viable authoritative-DNS and return-path adapter. Its v5
API accepts scoped personal access tokens and supports record operations and
snapshots. As observed on 2026-08-29, `fractavolta.com` was still served by
Gandi LiveDNS and its domain settings reported automatic snapshots enabled.

### Cloudflare

Cloudflare is a candidate edge-oriented authoritative-DNS adapter. Its API
can manage zones and records, and its wider platform can later provide a
tunnel-backed public edge and authenticated browser access. These are optional
capabilities; DNS migration must remain valid with all records set to DNS-only.

On 2026-08-29, the Cloudflare zone for `fractavolta.com` was created in
`pending` state. Pending state does not alter public DNS; activation requires
an explicit nameserver change at the registrar after the mirrored zone has
been verified.

## `fractavolta.com` mirror evidence — 2026-08-30

The Gandi source export contained 38 RRsets and 42 individual record values:
six A, 26 CNAME, three MX, five SRV and two TXT values. All source TTL values
were compatible with Cloudflare (300 or 10,800 seconds).

The pending Cloudflare zone now contains 40 DNS-only records: six A, 26 CNAME,
three MX, three SRV and two TXT. No Cloudflare record is proxied. This does not
alter the public authoritative answers while Gandi nameservers remain active.

Two Gandi SRV values intentionally use the DNS root target `.` to denote a
disabled service. Cloudflare's record API rejects that target because it
requires a hostname. They were deliberately not substituted, omitted silently,
or redirected. The zone is therefore **not mirror-verified** and its
nameservers must not yet be changed.

## `fractavolta.com` migration gate

Before replacing Gandi nameservers with the Cloudflare-assigned nameservers:

1. Export the current Gandi LiveDNS zone using its authenticated API.
2. Normalize and compare it with the Cloudflare zone.
3. Preserve apex GitHub Pages records, mail MX/DKIM/SPF/SRV records, the
   `mail` subdomain, origin records, and all application CNAMEs.
4. Keep imported Cloudflare records DNS-only for the first activation.
5. Record DNSSEC status and do not enable or transfer it implicitly.
6. Verify public DNS answers and dependent HTTPS/mail services before any
   Cloudflare proxy, Tunnel, Access, or origin-firewall change.

The return path is equally explicit: export Cloudflare, reconcile the Gandi
zone, verify the Gandi snapshot, change nameservers back at the registrar, and
verify public answers and services again.

## Acceptance evidence

A domain migration is complete only when Operium has dated evidence for:

- source and target zone exports;
- a zero-unexplained-difference comparison;
- registrar nameservers matching the intended provider;
- authoritative DNS responses from the new provider;
- apex, mail, and declared application-host checks;
- the provider-native snapshot or equivalent rollback artifact;
- the tested return procedure and its remaining assumptions.

## La Nasa projection

La Nasa may show a small, observer-local DNS configuration projection beside
the fleet view. It is an awareness surface, not a DNS control plane and not a
provider API client.

The ONA portal reads only an operator-written, public snapshot at
`ONA_NASA_DNS_STATUS_JSON` (default:
`<ops-state>/nasa-cache/dns-status.json`). The snapshot contains a dated,
sanitized state such as:

```json
{
  "schema": "operium.nasa.dns-view.v1",
  "observed_at": "2026-08-29T12:00:00Z",
  "source": { "kind": "operator-snapshot", "reference": "dns export/diff evidence" },
  "domains": [{
    "domain": "example.net",
    "migration_state": "pending",
    "registrar": "Example Registrar",
    "active_authoritative_dns": "Source DNS",
    "standby_dns": "Target DNS",
    "edge_mode": "dns-only",
    "dnssec_state": "not_observed"
  }]
}
```

The portal exposes the same projection in `/nasa/fleet` and `/status.json`.
When the file is absent or malformed, it explicitly reports
`no_public_snapshot` or `invalid_public_snapshot`; it never fills a missing
state from credentials or provider assumptions. The permitted fields exclude
record contents, tokens, account identifiers, origin IP addresses, browser
profiles, and end-user identities.

Writing or refreshing this snapshot stays outside La Nasa. It follows the
read-only export/normalize/diff workflow, preserving the distinction between
observed provider state and intended evolution.

## Next implementation increment

Implement read-only provider adapters first:

```text
operium dns export --provider gandi --domain <domain>
operium dns export --provider cloudflare --domain <domain>
operium dns diff --domain <domain>
```

Write/apply commands require a separate, explicit authorization and must
retain a dated export before making a change.
