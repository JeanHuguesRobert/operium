---
document_role: "operational"
document_kind: "health-note"
visibility: "public"
lifecycle_state: "active"
---

# Olé Olé public DNS health

## Observation — 2026-08-13

The external DNS zone for `acorsica.org` was updated at Gandi with:

```text
oleole  300  IN  CNAME  jhn-baronsmariani-org.netlify.app.
```

The `oleole.acorsica.org` alias is already assigned to the JHN Netlify site.

The same site also has `oleole.baronsmariani.org` as a Netlify alias. An
earlier placement of the `oleole` CNAME in the `baronsmariani.org` zone was
initially treated as a domain-placement mistake. It is now an intentional
second public alias, not an incident: the two aliases serve complementary
public and institutional naming roles.

## Current health

| Surface | State | Evidence |
| --- | --- | --- |
| Gandi desired DNS | configured | Operator supplied the zone record above. |
| Authoritative DNS resolution | verified | 2026-08-13: `ns1.gandi.net` and `ns2.gandi.net` both returned the CNAME with TTL 300. |
| Recursive public DNS resolution | verified | 2026-08-13: workstation resolver returned the Netlify CNAME (TTL 104). |
| Netlify TLS | verified | 2026-08-13: HTTPS smoke requests returned HTTP 200 on both public aliases. |
| Olé Olé Edge API | verified | 2026-08-13 deploy `6a7deefc69a83aaaf789d08e`: `/api/oleole/health` returned HTTP 200 JSON on both aliases. |

## Next verification

Re-run the DNS, TLS, and API smoke checks after any Netlify alias, DNS, or Edge
Function change.
