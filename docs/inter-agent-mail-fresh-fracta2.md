# Fresh inter-agent mail on Fracta2 — 2026-11-10

Status: **architectural gate, not installed, no external mail sent**. Principal chose a **new, empty mailbox system**, explicitly abandoning the old Stalwart mailbox state as a migration dependency. Keep the public service's name `mail.fractavolta.com`; preserve existing MX `mail.fractavolta.com` without touching apex `fractavolta.com` MX (Gandi). Operium #77 and #37.

## Boundaries (fail closed)

- The server is for **agent-to-agent internal mail** first. Incoming public SMTP and outgoing public Internet SMTP are separate gates, not automatically granted by installing a mail binary.
- Human third-party mail must never be sent without a specific explicit user instruction. Internal mail transport does not authorize forwarding, relaying, or any mail sent outside the controlled agent domain. Do not restart the old unrestricted Gmail-forwarding script `scripts/ops/stalwart-gmail-forward-setup.sh`.
- No existing mail data migration; create fresh dedicated accounts, bounded quotas and encrypted backups. Inventory accounts *before* sending; keep auth material outside Git and command output.
- Stalwart should expose its management/JMAP bootstrap to `127.0.0.1:8080` via SSH/Tailscale only. Keep IMAPS/submission private. Enforce no external relay, and reject unknown recipients. Enable TCP 25 inbound only when deliberately ready for public delivery (host firewall currently blocks it although OCI Security List permits it). Test locally first without contacting real addresses.
- **Crucial port conflict**: current production Caddy owns `*:443`; Stalwart's modern default HTTPS listener also uses port 443. Do not run a default new Stalwart install and assume safe coexistence. Configure Stalwart HTTPS on loopback-only non-443 port, proxy through dedicated authenticated `https://mail.fractavolta.com` Caddy vhost if needed, and exclude public administration paths. Test the actual installed release's listener config; older 0.16.x scripting may be incompatible with current 1.x runtime.
- Download official installation script into a fixed local path and review pinned content/version before root execution; don't blindly pipe a changing remote script to shell. Official installation setup requires root and launches a service; reserve a trusted owner-root step for that operation. Existing `scripts/ops/fracta-stalwart-phase1-*.sh` target the retired `fracta` node and old API; do not run them unmodified.

## Acceptance protocol

1. Presence-only backup and config check: `/etc/stalwart/`, `/var/lib/stalwart/`, secret paths; no old backups migrated. Independent host health check and available storage before install.
2. Pin the latest chosen Stalwart version and review matching setup/listener API. Install without binding existing Caddy port 443 or exposing setup UI publicly. Ensure dedicated systemd service account and restricted directories.
3. Create at least two **internal** agent accounts and validate local message submission, receipt, read, persistence and reboot behavior. Tests use only internal recipients; no external delivery.
4. Explicit whitelist/rules for eventual external mail receipt (and no outbound forwarding), DKIM/SPF/DMARC only once public SMTP setup is actually required; compare DNS to its own subdomain, preserving apex Gandi.
5. Backups and periodic restore verification; publish a receipt to Operium with no passwords, mail contents or recipient secrets.

Reference: https://stalw.art/docs/install/platform/linux/ and https://stalw.art/docs/install/security/ (current upstream documentation to review at deployment). This plan is not proof Stalwart is running.

## 2026-11-10 — Installer stage completed, protected bootstrap prepared

Owner ran `scripts/ops/stage-stalwart-fresh-fracta2.sh --apply` and reported `STAGED: Stalwart v1.1.0 installed but disabled/stopped`; independently verified binary v1.1.0, unit disabled/inactive, no `/etc/stalwart/config.json`, no active SMTP/IMAP/8080 listeners; Caddy still owns :443 and browser HTTPS 401. Note: the default bootstrap administrator password was printed to the **local system journal** by the short-lived install service; never paste it to chat or GitHub.

Operator helper `scripts/ops/start-stalwart-private-bootstrap-fracta2.sh` stages a **temporary local-only wizard** while preserving the installed configuration's pending state. It validates installation and Caddy, adds a `systemd` drop-in with `IPAddressDeny=any`, `IPAddressAllow=localhost`, `NoNewPrivileges=true` and `ExecStartPre=/usr/bin/test ! -e /etc/stalwart/config.json` (refuses any automatic transition after wizard writes config), starts the unit **without enabling boot**, requires `http://127.0.0.1:8080/admin` accessible locally, verifies no mail protocol listener, and rechecks the hosted browser. It is designed for a *trusted local/SSH-tunnel-only administrator*, not as a public setup endpoint; an externally accessible wizard is unacceptable. Dry-run preflight PASS; **NOT APPLIED until owner runs sudo**.

**Important**: Stalwart bootstrap mode binds `[::]:8080` despite service configuration (per Stalwart docs). The systemd IPAddress filters are the security boundary for local access, with the OCI guest firewall rejecting TCP/8080 and no OCI ingress rule. If systemd filters unsupported, do not assume the listener is private; stop and investigate. Creating the first config file is not sufficient for service production: after setup it would normally start default `*:443` and other public listeners; the `ExecStartPre` guard intentionally prevents this. Review and explicitly replace default NetworkListeners with localhost-only JMAP and controlled private agent SMTP before removing guard. Do not put administrator passwords into issue comments or chat.
