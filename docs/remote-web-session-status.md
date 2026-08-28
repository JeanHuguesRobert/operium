---
title: "Remote Web Session and Hosted Browser Status"
document_role: operational
document_kind: capability-status
visibility: public
lifecycle_state: working
update_policy: UP-INFRASTRUCTURE-HEALTH
language: en
date: "2026-08-28"
last_modified_at: "2026-08-28"
related:
  - "hosted-browser-kasmvnc-cdp.md"
  - "https://github.com/JeanHuguesRobert/cogentia/blob/main/research/nasa_situated_views_and_interactive_surfaces.md"
---

# Remote Web Session and Hosted Browser Status

## Scope

This page records observed operational facts and proposed work separately. It
does not redefine the Hosted Browser architecture described in
[`hosted-browser-kasmvnc-cdp.md`](hosted-browser-kasmvnc-cdp.md).

## Observed facts — 2026-08-28

| Capability | State | Evidence / limit |
|---|---|---|
| Pi local NASA HTTP service | available | `http://127.0.0.1:8794/boot.html` returned HTTP 200. |
| Pi local Firefox view | human-validated | A clean reboot launched normal-window Firefox at the local NASA URL; the operator confirmed La Nasa was visible. |
| Fracta2 hosted Chrome | available at process level | The hosted-browser service and a Chrome process targeting the Pi NASA URL were observed. |
| Pi to Fracta2 RFB tunnel | reachable | Pi loopback port 5902 accepted TCP connections. |
| Native VNC viewer on Pi | rejected for this path | It could connect but did not create a human-visible Pi surface. The VNC autostart was removed; see [Operium #24](https://github.com/JeanHuguesRobert/operium/issues/24). |
| Pi Remote Access service | present, not end-to-end validated | `wayvnc` was active with `enable_auth=true`; remote human interaction was not tested in this record. |

## Known discrepancy requiring audit

The existing Hosted Browser POC records KasmVNC as an architectural and
observed baseline. The live route investigated here exposed an RFB endpoint
through `x11vnc` and a Pi SSH tunnel. These may be parallel deployments,
successive implementations, or stale documentation. Do not treat either as the
sole current truth until an explicit Fracta2 service audit resolves the
relationship.

## Intended evolution

The proposed `Remote Web Session` capability is transport-neutral. A KasmVNC
adapter is a candidate because its browser client can place encoding work on
Fracta2 and avoid the Pi native-VNC-window failure. It remains an experiment,
not a deployed solution.

## Acceptance evidence for any adapter

1. A human sees the hosted Chrome content on the Pi physical screen.
2. Pointer and keyboard input reach the hosted browser.
3. The fallback to local Firefox works when the hosted path is unavailable or
   materially degraded.
4. CPU, memory, latency, and reconnect behaviour are recorded.
5. No unprotected management port or secret is exposed.

## GitHub routing

- Operium issue #24 records the Hosted Browser projection experiment, including
  the useful native-VNC failure and the next KasmVNC web-projection test.
- Operium issue #26 records the observer-relative NASA projection model.
- Operium issue #27 records Remote Access validation for the Pi shared
  graphical session.
