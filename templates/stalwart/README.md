# Stalwart templates (secret-free)

Fragments and examples for the private Stalwart install on `fracta`.

| File | Purpose |
|------|---------|
| `Caddyfile.mail.fragment` | Public HTTPS reverse-proxy for JMAP; admin paths blocked |
| `stalwart.env.example` | Environment file shape (`STALWART_PUBLIC_URL`, recovery comments) |
| `accounts-plan.ndjson.example` | Declarative domain + phase1 accounts (replace secrets) |
| `stalwart-backup.service` / `.timer` | Daily encrypted backup unit |
| `stalwart-cert-sync.service` / `.timer` | Sync Caddy's renewed public certificate into Stalwart |
| `logrotate-stalwart` | Log retention without unbounded growth |

Operational runbook: [`docs/stalwart-private-mail.md`](../../docs/stalwart-private-mail.md).

**Never** commit real passwords, recovery admin strings, backup keys, or private keys here.
