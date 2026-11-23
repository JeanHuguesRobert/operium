---
document_role: operational
document_kind: documentation
visibility: public
lifecycle_state: active
language: en
date: "2026-11-23"
last_modified_at: "2026-11-23"
license: CC BY-SA 4.0
affiliation: Institut Mariani / C.O.R.S.I.C.A., 1 cours Paoli, F-20250 Corte, Corsica
update_policy: UP-DEFAULT-REVIEWED
---

# Pinned runtime preflight and durable restart receipts

Owning cognitive packet: [Operium #81](https://github.com/JeanHuguesRobert/operium/issues/81). Root causes were observed when deploying Cogentia CPKT-2026-011 on Fracta2.

## 1. Test the actual dependency boundary

A source-only archive can pass JavaScript syntax checks while lacking dependencies resolved by its imported modules. Before any service restart, exercise the **safe, import-only module** from its *real pinned directory*, and check that the installed lockfile matches the declared runtime versions.

    node scripts/ops/release-preflight.js \
      --lock /srv/cogentia/releases/mcp-cogentia/<SHA>/inseme/.runtime-deps/package-lock.json \
      --dependency '@supabase/supabase-js@2.117.1' \
      --dependency 'dotenv@18.0.3' \
      --import /srv/cogentia/releases/mcp-cogentia/<SHA>/cogentia/scripts/ops/jhn-consent-local-server.js

Exit code 0 and RELEASE_DEPENDENCIES_VERIFIED mean the named import works in the release. This does not replace a separate isolated HTTP smoke for an executable service, and does not itself deploy a service. **Do not import a module that starts a production listener as an import-only check**; launch that module with a test port instead.

## 2. Never make a service restart depend on returning through that same service

The RPC origin may disappear after it successfully initiates its own replacement. Preserve a named job outside the service being restarted. An authorized operator can schedule the worker as an independent transient systemd unit (adapt the explicit target and ticket):

    sudo systemd-run --unit=operium-restart-<TICKET> --on-active=2s --collect \
      /usr/local/bin/node /srv/cogentia/repos/operium/scripts/ops/managed-service-restart.js \
      --apply --ticket <TICKET> \
      --service mcp-cogentia.service \
      --expected-cwd /srv/cogentia/releases/mcp-cogentia/<SHA>/cogentia \
      --health http://127.0.0.1:8791/health \
      --receipt-dir /var/lib/operium/restart-receipts

This is an example for an independently authorized restart, not a request to restart the service now. The worker requires an exact service unit, an exact expected working directory and a loopback health endpoint. A unique ticket is created with exclusive wx semantics **before any restart**. It stores prepared → executing → verified or attention_required, pre/post PID, revision directory and a health observation. Replaying the same ticket fails without triggering a second restart. After a lost RPC, read the durable receipt by ticket; **do not retry just because the RPC was interrupted**. If the receipt still reads executing, investigate actual systemd state and reconcile with a separately witnessed outcome. A receipt is evidence, not an automatic COP budget settlement.

### Stability boundary

An independently supervised worker survives the originating MCP connection, but still has the normal systemd execution requirements. It does not itself create root or COP authority. Apply only after the release import preflight and with an existing authorized effect route. Exercise the worker with a fake adapter (node --test scripts/test-ops-release-restart.js) before a live rollout. No live production service was restarted by this corrective packet.

## 3. Audit old COP reservations without inventing their outcomes

Run read-only:

    node scripts/ops/cop-pending-audit.js --age-hours 24

The auditor loads the existing Inseme COP event store, uses the original reservation/settlement/release events and reports outstanding reservations. Age triggers **investigation**, not automatic release. It refuses --apply. Relate each idempotency key to its command/result witness before settlement; use existing Cogentia reconciliation when it has a matching claim. In the 23 November 2026 live check, **10 pending reservations of one step each** (16–17 November) were reported. None were changed. They require separate provenance review.

## Verification

Run node --test scripts/test-ops-release-restart.js, then the preflight with the intended pinned release. Check the unit PID/working directory and its loopback health endpoint independently. The historical incident was fixed in the CPKT-2026-011 release; these generic tools are prepared for future reuse and do not modify existing unit files by themselves.
