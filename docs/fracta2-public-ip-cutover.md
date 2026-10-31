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
