---
title: "rpi3-view edge consultation portal"
description: "Lightweight local portal with cached network health and links to Fractanet web experiences."
document_role: operational
document_kind: runbook
visibility: public
lifecycle_state: active
update_policy: UP-DEFAULT-REVIEWED
---

# rpi3-view edge consultation portal

## Observed deployment

Deployed and verified on 2026-07-28:

| Surface | Value |
|---|---|
| Primary kiosk URL | `http://localhost/` |
| Tailnet URL | `http://rpi3-view/` |
| Local mDNS URL | `http://rpi3-view.local/` when local name resolution is available |
| Static root | `/srv/operium-edge-portal` |
| HTTP server | BusyBox `httpd` |
| Port | `80` through systemd `CAP_NET_BIND_SERVICE`; process remains user `jh` |
| Service | `operium-edge-portal.service` |
| Refresh timer | `operium-edge-portal-refresh.timer` |
| Refresh interval | 5 minutes with a small randomized delay |
| Snapshot | `/srv/operium-edge-portal/status.json` |

The service and timer are enabled and active. The page and JSON snapshot both
returned HTTP 200 locally on the Pi and from the Windows workstation through
Tailscale.

The first snapshot reported the Views Store and all four currently known nodes
as reachable. This is an observation at one instant, not a continuous
availability guarantee.

`operium-node-agent.service` was initially observed as disabled and inactive.
It is now enabled with the read-only SOMA profile from a small immutable
runtime artifact. This is separate from the active edge portal.

## Role

The Pi is a consultation endpoint, not a development node or control-plane
authority. The portal provides:

- a stable local home page;
- links to available web experiences;
- a compact reachability dashboard;
- a cached degraded mode when the WAN path disappears.

The portal itself requires no Node process or client-side secret. BusyBox
serves one static page and one JSON file.

The host has a separate ARMv7 Node.js `v22.23.1` installation at
`/home/jh/.local/bin/node`. It is absent from the default non-interactive SSH
`PATH`, which is why an initial `command -v node` probe incorrectly reported
it as missing. The Pi has no Git worktree; the SOMA agent uses the 3 MB runtime
artifact under `~/srv/operium-runtime/releases/dd724db`.

These facts do not make the Pi a general development node. They support
existing edge services and should be kept distinct from the lightweight portal
runtime.

## Degraded mode

`operium-edge-portal-refresh` probes:

- the public Views Store health endpoint;
- Fracta through the mesh;
- the office workstation;
- the Android/Termux node.

It writes a complete temporary JSON file and atomically renames it to
`status.json`. A failed or interrupted writer therefore does not expose a
partially written snapshot. If Internet access disappears, the local page and
the last completed snapshot remain available.

Reachability is deliberately not presented as deep service health. Future
versions may consume richer Operium projections when `/ops/status` becomes
available on Fracta.

## Current links and known drift

The Views Store and its live documentation are available:

- `https://cogentia.fractavolta.com/`
- `https://cogentia.fractavolta.com/docs`

The planned Fracta paths `/ops/status` and `/ops/console/` returned HTTP 404
during deployment verification. The portal labels Operium Console as planned
instead of linking to a service that is not deployed.

## Operations

```bash
ssh rpi3-view "systemctl status operium-edge-portal.service"
ssh rpi3-view "systemctl status operium-edge-portal-refresh.timer"
ssh rpi3-view "sudo systemctl start operium-edge-portal-refresh.service"
curl http://rpi3-view/status.json
```

Runtime files are owned by Operium source:

- `apps/edge-portal/index.html`
- `scripts/ops/rpi3-view-edge-portal-refresh.sh`
- `scripts/ops/install-rpi3-edge-kiosk-browser.sh`
- `templates/rpi3-view/operium-edge-portal*.{service,timer}`
- `templates/rpi3-view/lxsession-LXDE-pi-autostart`

## Home browser (Firefox ESR, normal window)

The portal is HTTP-only at **`http://127.0.0.1/`** (also `http://localhost/`).

**Mode:** default **`KIOSK_MODE=window`** — Firefox opens a normal window so the
operator keeps the Pi panel menus, browser chrome, **Back**, and right-click.
Full-screen lock-down is optional: `KIOSK_MODE=kiosk`.

**Profile:** dedicated directory
`~/.mozilla/firefox/operium-edge.profile`, opened with **absolute**
`firefox -profile /path/...` (never `-P name`, which reopens the profile
manager after hard reboots despite “remember”). Opener also waits for
HTTP 200 on `http://127.0.0.1/` before launch.

**Observed stack (2026-07):** Raspberry Pi OS Bookworm with **labwc Wayland**
(`DESKTOP_SESSION=LXDE-pi-labwc`). Primary autostart:

- `~/.config/labwc/autostart` (managed BEGIN/END block)

XDG `.desktop` is kept only as `.disabled` to avoid double launch.

**Browser:** **Firefox ESR** by default. Chromium may need a profile-lock fix
after hostname rename (`scripts/ops/fix-chromium-profile-lock-rpi.sh`).

Install / refresh:

```bash
scp operium/scripts/ops/install-rpi3-edge-kiosk-browser.sh rpi3-view:~/
ssh rpi3-view 'bash ~/install-rpi3-edge-kiosk-browser.sh'
# optional:
# KIOSK_MODE=kiosk bash ~/install-rpi3-edge-kiosk-browser.sh
```

Then log out/in (or reboot). Manual:

```bash
firefox-esr --new-window http://127.0.0.1/
```

### Refresh button

**Refresh status** calls `/cgi-bin/refresh` (re-probes mesh, rewrites
`status.json`, returns JSON) and updates the footer with both snapshot time and
local check time. **Reload page** does a full browser reload.

Deploy portal files:

```bash
scp apps/edge-portal/index.html rpi3-view:/srv/operium-edge-portal/index.html
scp apps/edge-portal/cgi-bin/refresh rpi3-view:/srv/operium-edge-portal/cgi-bin/refresh
ssh rpi3-view 'chmod +x /srv/operium-edge-portal/cgi-bin/refresh'
```

## Future local network

The portal currently relies on Tailscale names and whatever WAN path is
available through the phone. A future office LAN may make `rpi3-view` a local
anchor for other devices and reused routers.

That network design is intentionally deferred until the available routers,
their firmware and their physical roles are inventoried. The current portal
does not assume a specific router, DHCP authority, DNS resolver or Internet
gateway.
