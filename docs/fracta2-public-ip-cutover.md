# Fracta2 public-IP cutover — checkpoint, 2026-10-31

Tracking: [operium #77](https://github.com/JeanHuguesRobert/operium/issues/77). Status: **not cut over**. This is an operational checklist, not authorization to destroy the old node.

## Verified

- Reserved IPv4 `82.70.234.207` still belongs to old Fracta. Fracta2 has `10.0.0.2` and Tailscale `100.84.109.87`; no public IPv4.
- ThinkPad's configured `ssh fracta2` works using the proper SSH identity. The Cogentia shell is unprivileged (`ubuntu`, no root escalation); it is not the recovery channel.
- `cogentia`, `agent-gateway`, `agent-john-whatsapp`, `caddy` are active. Caddy listens on HTTP `:80` but not HTTPS `:443`.
- A *non-live* candidate Caddy HTTPS config was validated at `/tmp/operium-fracta2-https-candidate.Caddyfile`; it is not deployed or security-reviewed. It preserves HTTP origins using `auto_https disable_redirects`. Browser authentication and all host routes must be checked before deployment.
- Root disk: 45 GB, 4.0 GB free (91% used). Old browser incident journal compressed to `/tmp/incident-browser-20261018/rfb-journal.log.zst`; archive integrity tested before removing original. Detached job receipt: `/srv/cogentia/work/ops-jobs/rfb-archive-20261031/receipt`.
- Stalwart is inactive on Fracta2. It was experimental and is not a critical blocker to the IP cutover if the temporary mail outage is documented. Its old unrestricted Gmail forwarding script must not be reused unmodified; see `docs/stalwart-private-mail.md`.

## Required preflight (OCI and host admin privileges)

1. Verify target subnet effective Internet Gateway route, security lists/NSGs, host firewall and inbound 80/443; preserve working SSH/Tailscale access independent of public IP. Test operator recovery.
2. Stage and validate actual live-path HTTPS Caddy configuration, host routing, certificate strategy and hosted-browser authentication. Do not activate the unreviewed `/tmp` prototype blindly.
3. Inventory public hostnames, expected responses and accepted mail outage. Save old and target private-IP OCIDs and a rollback command before changing the reserved IP.
4. Confirm services, disk and logs. Avoid renaming OCI/Tailscale/OS identity as part of this network change.

## Planned switch (not executed)

- Operator reassigns the **existing** reserved public IPv4 from old Fracta to Fracta2; do not allocate another public IP.
- Verify externally HTTPS for every required hostname, authentication, browser and agent endpoints, plus independent admin reconnection.
- If unsuccessful, reattach the IPv4 to the saved original private-IP OCID and verify rollback. Do not retire old VM while recovery is unproved.
- Rename logical role `fracta` separately after service, DNS, SSH and Tailscale identity validation.

## Agent mail boundary

Internal Stalwart agent messages are allowed. Only explicitly permitted SMTP notifications to the Principal's `jeanhuguesrobert@gmail.com` may leave; reject other external addresses, including forwarding and mixed-recipient cases. JHN may read, classify and create Gmail **drafts**; actual correspondence send is manual or exceptionally authorized for the exact message. Do not send real mail as an incidental smoke test.

## Evidence rule

Record OCI attachment, host listeners, per-host probes, auth, accepted outages, recovery and receipts in issue #77. An active service is not end-to-end proof. Distinguish current facts, candidate configs and completed acts.

## 2026-11-10 — storage recovered; WhatsApp deferred; HTTPS staged safely

- Confirmed Fracta2 root filesystem at **80% used, 9.1 GiB available** (after eliminating the abandoned multi-file Baileys authentication state and earlier temporary-build caches). WhatsApp intentionally **stopped**, its new private SQLite credentials unpaired. **Do not start or re-pair WhatsApp as a prerequisite for #77**.
- Caddy still serves :80 and does not yet listen on :443. Real HTTP hostname checks: `capable.lepp.fr` 200, `suicidecorse.baronsmariani.org` 200, `privai.acorsica.org` 200, unauthenticated `browser.fractavolta.com` 401. Tailscale independent admin address `100.84.109.87` remains present.
- HTTPS candidate `/tmp/fracta2-https-stage-20261109-resume77/Caddyfile` passes `caddy adapt` and contains 12 HTTPS site blocks, retaining the two hosted-browser Basic Auth upstreams on :8444/:8445. HTTP virtual hosts remain in `/etc/caddy/Caddyfile.d/*.caddy`.
- New helper `scripts/ops/install-fracta2-caddy-https-stage.sh` preflights vhosts + browser authorization and has an explicit owner-sudo `--apply` mode. It builds `/etc/caddy/fracta2-edge-https/*.caddy`, adds HTTPS route import while **disabling premature automatic HTTP redirects**, validates Caddy syntax, reloads, checks :443 and probes HTTP/browser 401. It stores the prior root file and attempts rollback on failure. **This helper is prepared, not yet applied.** After apply, expect automated TLS certificate issuance to fail until the reserved IPv4 has reached Fracta2 and OCI ingress 80/443 is open; do not misreport this as a successful end-to-end HTTPS test.
- OCI public-IP metadata on Fracta2 still reports private IP `10.0.0.2` with `publicIp:null`. The reserved 82.70.234.207 is still intended for transfer, **not yet transferred**. The local `sudo` route in the agent tool is explicitly `NoNewPrivs`; the owner's independent SSH/serial-console administration remains the route for the Caddy installer.
- `/etc/stalwart` and `/var/lib/stalwart` are still absent on Fracta2. **Mail continuity must be decided or separately restored before the public IP cutover**, even though WhatsApp can remain stopped; low criticality of WhatsApp does not imply a grant to lose external mail. Do not tear down old Fracta until its mail/state dependencies have been reviewed.

### Remaining go/no-go

1. Owner installs HTTPS Caddy stage (without redirect), inspect service and secure browser routes.
2. Using authenticated ThinkPad OCI CLI, inspect/repair ingress TCP destination **80,443** in the effective Security List / NSG without clobbering other rules. Existing list formerly had mistaken source-port 80/443 rules; it must be corrected. Verify default route through Internet Gateway and recovery on Tailscale/serial console.
3. Preserve/restore or explicitly accept mail outage for `mail.fractavolta.com` / Stalwart. No automatic outbound-mail tests.
4. Prepare `oci network public-ip update` only when gates 1–3 satisfied; delete currently attached ephemeral IP if necessary by verified OCI procedure, then reassign existing RESERVED IP with exact OCIDs and poll. Have original private-IP object for rollback. Verify all public domains and authenticated browser **before** retirement of the old node.

## 2026-11-10 — Principal accepts temporary outage during IP reassignment

Principal decision: temporary unavailability of web, hosted-browser and mail *during migration* is acceptable; restart services on the surviving VPS once its reserved public IPv4 has been assigned. **Service continuity during the cutover is no longer a blocking acceptance gate.** This does *not* authorize data loss, deleting the old node before checking required state, or permanently abandoning mail. WhatsApp re-pairing remains postponed.

Short path:

1. Apply the validated Caddy HTTPS stage on Fracta2 via existing owner SSH/serial `sudo` command (see `scripts/ops/install-fracta2-caddy-https-stage.sh --apply`), keeping HTTP accessible and not relying on certificate issuance until port 443 is externally reachable.
2. Inspect and repair OCI effective ingress rules for **destination** TCP 80/443 (not source ports); retain SSH/Tailscale/serial recovery. In the authenticated OCI CLI context, confirm that the target primary private IP has no conflicting assigned public IP (the local metadata says null, but OCI control-plane lookup is authoritative). Only delete an ephemeral public-IP object when confirmed assigned to the target. Never delete the RESERVED IP object.
3. Using OCI CLI on the authorized workstation, update the **existing RESERVED** public IP `82.70.234.207` (public-IP OCID `ocid1.publicip.oc1.eu-marseille-1.amaaaaaavwivkryaqh76vugxtgzikmgv2kly5o7mwrykzcqphc7ij6njo4kq`) to target private-IP OCID `ocid1.privateip.oc1.eu-marseille-1.abwxeljrqjtbvxf476wclmgn3mhgz5ovuwftj2bzwuoxbqq7yybyk2fgo3cq`, region `eu-marseille-1`. Original private-IP object for rollback: `ocid1.privateip.oc1.eu-marseille-1.abwxeljrof5t2rdqtcolcmn45x2lw4fsodkjlakfn32y5nfyh5rq7ebz2kla`.
4. **Poll** `oci network public-ip get` until `lifecycle-state=ASSIGNED` and the `private-ip-id` is exactly the target. OCI warns the reassignment is asynchronous and can leave the IP unassigned; do not trust update command return alone. Then check HTTPS certificate issuance, HTTP + HTTPS, browser 401/auth routing, mail service data as applicable and private administrative access. Roll back the reserved IP association to the old private-IP OCID if the new node's network path cannot be restored.
5. Restore/start any deferred services only after checking their specific credentials and persistent data; do not automatically start WhatsApp. Retire the old VPS in a distinct later step after verification of residual unique state.

No requirement to preserve public uptime during 1–4. Remaining hard safeguards are avoiding permanent loss of the reserved IP and maintaining an independent administrative recovery route.

## 2026-11-10 — Priority P0: restore browser.fractavolta.com after IP reassignment

Principal reports **RESERVED IPv4 `82.70.234.207` successfully ASSIGNED to Fracta2's primary private IP `10.0.0.2`**, and assigns priority to hosted Unix/X11/Chromium sessions at `browser.fractavolta.com`; WhatsApp stays stopped.

**Root cause verified**: the local OCI Ubuntu guest firewall has `iptables` `INPUT` allowing only established traffic, ICMP, loopback and TCP destination 22, followed by unconditional `REJECT --reject-with icmp-host-prohibited`. Caddy is active and listens on `:80` and `:443`; the local browser route returns HTTP 401 without credentials; both KasmVNC backends `127.0.0.1:8444` and `:8445` return 401 (their own authentication); `hosted-browser@hosted-jeanhuguesrobert.service` and `hosted-browser@hosted-fred2b20250.service` are active. DNS `browser.fractavolta.com` resolves to `82.70.234.207`. ACME failures in Caddy explicitly show connection timeout to `82.70.234.207:80/443`. From Fracta2 the public-IP loopback test fails `No route to host`; **this is not a substitute for independent external verification**.

**Fix prepared, not yet applied**: `scripts/ops/enable-fracta2-public-web-iptables.sh` preflight PASS; owner-run `sudo bash .../enable-fracta2-public-web-iptables.sh --apply` inserts only NEW TCP destination 80/443 ACCEPT rules, preserves SSH and the existing OCI `InstanceServices` chain, atomically persists the complete IPv4 ruleset to `/etc/iptables/rules.v4`, then checks Caddy :80/:443 and browser unauthenticated 401. This is specifically preferable to opening RFB ports 5900/5901 publicly. Requires independent owner SSH/sudo due to tool `NoNewPrivs=1`; agent has not modified firewall.

**Next acceptance gates after apply**: `curl` from an *external workstation* must reach `http://browser.fractavolta.com` with HTTP 401 (no redirect) and HTTPS with a valid certificate after Caddy ACME succeeds. Test login separately with both principals' own credentials and verify each account opens its own KasmVNC session and Chromium; no credentials or cookies in issue/logs. If Caddy ACME remains in exponential retry after firewall fix, owner `sudo systemctl reload caddy` and inspect redacted `journalctl -u caddy` for issuance. Keep WhatsApp stopped.
