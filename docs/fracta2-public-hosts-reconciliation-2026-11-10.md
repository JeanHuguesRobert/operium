# Fracta2 public services reconciliation — 2026-11-10

Tracking: [Operium #77](https://github.com/JeanHuguesRobert/operium/issues/77). Source of truth: live resolver plus running Caddyfiles and unit probes. Historical Gandi zone recorded in `docs/fractavolta-dns.md` is not a substitute for current DNS.

The Principal accepted downtime during single reserved-IP reassignment and confirmed successful authenticated KasmVNC/Brave re-entry. Public IPv4 `82.70.234.207` now belongs to surviving Fracta2. Keep WhatsApp stopped until separately requested.

## Inventory by service, not just hostname

- **Public HTTPS already observed at Fracta2**: `browser.fractavolta.com` (Basic Auth), `village.acorsica.org`, `school.acorsica.org`, `institut.acorsica.org`, `commons.acorsica.org`, `privai.acorsica.org`, `1755.acorsica.org`, `capable.acorsica.org`, `napoleon.acorsica.org`, `diaspora.acorsica.org` (302 intentional), `suicidecorse.baronsmariani.org`, `riseandfall.baronsmariani.org` (eleven books + browser).
- **Existing application processes, no public HTTPS hostname yet**: Cogentia MCP/Guide/COP on localhost `:8791` (`GET /guide/`, `/ops/status`, `/cop/health` all 200), local Magnum/Magistral router on `:8880` (**do not expose publicly**), FractaVolta Streamlit on Tailscale `100.84.109.87:8502/simulateur/` (200).
- **Deployable KYS static artifact**: `/srv/cogentia/kys-services-staging/source/apps/personal/dist`, commit `25b5e99c631ea9e86a28e90afa6134b80dd8476c`; installer dry-run passes, origin destination `/srv/www/kys-services/current` not yet deployed. `services.acorsica.org` resolves to reserved IP, no current TLS vhost.
- **Mail**: `mail.fractavolta.com` A/MX retained but Stalwart binary/state/config not found on Fracta2. Principal explicitly authorizes **new inter-agent mail setup from zero**, not recovery of the old Stalwart database. New installation should retain private JMAP/IMAP and no unrestricted external relay, and default to no outbound mail. `fractavolta.com` apex MX remains Gandi (do not alter). A staged new install is not a tested or authorized outgoing mail service.
- **Old views/store and app names unassigned**: existing DNS still points historical hosts such as `rhuma`, `simpliwiki`, `auxilia`, `inox`, `inseme`, `kudocracy`, `platform`, `vigilia`, `net`, `corsica`, `cyrnea`, `ophelia`, `personal.cogentia`, `commons.cogentia` to 82.70.234.207. Their old View Store on Fracta (`localhost:3423`) is not running on Fracta2. Neither falsely respond 200 nor publish private services under these names without first defining destination. Likewise `magistral.fractavolta.com` must not proxy internal :8880.
- **Independent providers**: apex `fractavolta.com` and `acorsica.org` via GitHub Pages; `jhn.baronsmariani.org` and `oleole.acorsica.org` via Netlify; main mail `@fractavolta.com` through Gandi. Do not migrate these by changing public DNS.

## Prepared publication (not yet applied)

Owner applies one script `sudo bash /srv/cogentia/repos/operium/scripts/ops/publish-fracta2-public-facades.sh --apply` after successful dry-run. The script deploys KYS immutable release, adds dedicated *public* HTTPS vhosts for `cogentia.fractavolta.com` / `cop.fractavolta.com` with explicit path allow-list, `fracta.fractavolta.com` / `www.fractavolta.com` with `/simulateur/` reverse proxy, and `services.acorsica.org` as static SPA. Existing browser and eleven book routes are retained. Secret-bearing agent gateway, Magistral, Stalwart, and internal admin services are **not** exposed. No DNS edits.

`python3 scripts/ops/audit-fracta2-public-hosts.py` reports current live A-resolution and live/staged/unassigned vhosts in JSON. It reads rather than mutates and should be rerun after every edge change; unknown historical domains remain a deliberate pending classification, not an automatic wildcard mapping.

## Acceptance criteria after privileged install

1. Caddy validation and `reload`, HTTPS certificate issuance; `https://cogentia.fractavolta.com/guide/` 200, `.../ops/status` 200, `.../cop/health` 200 and `/mcp` public intended response; `https://cop.fractavolta.com/cop/health` 200.
2. `https://fracta.fractavolta.com/simulateur/` 200 and Streamlit assets/WS functional, `https://www.fractavolta.com/` explicit response, and no changes to apex Github Pages.
3. `https://services.acorsica.org/`, `/services`, `/rights`, `/kys-services.json` and `/services/serenia-rsa.json` 200, nonexistent assets and API 404 (no false SPA response).
4. Regression: authenticated browser for Principal retained and other book sites 200; WhatsApp remains off.
5. Establish new, data-empty mail only after separate configuration review; do not assume this publication step sends/receives SMTP.

## Final retirement of old VPS

Only after review of unique data or needed backups, recovery access and public service acceptance; node role renaming is an independent task. Do not reuse old Fracta Tailscale identity by destroying Fracta2's present identity.
