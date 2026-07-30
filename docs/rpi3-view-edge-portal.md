---
title: "rpi3-view edge portal — control-room display (step 1)"
description: "Stabilized local web home on the Paoli Pi: first Fractanet control-room UI surface."
document_role: operational
document_kind: runbook
visibility: public
lifecycle_state: active
updated: "2026-07-30"
---

# rpi3-view edge portal — control-room display (step 1)

**Operator nickname:** the small always-on screen is affectionately **“La Nasa”**
(the Fractanet control room). This document freezes **step 1**: a reliable
local web home on `rpi3-view`, not yet a full management console.

**Stabilized:** 2026-07-30 (Operium `main`).  
**Runbook owner:** Operium.  
**Node:** `rpi3-view` (Raspberry Pi 3, Paoli LAN edge display).

## What this is (and is not)

| Is | Is not |
|----|--------|
| Local HTTP home at `http://127.0.0.1/` (and tailnet `http://rpi3-view/`) | Coding workspace or corpus monorepo |
| Reachability dashboard (mesh nodes + Views Store) | SOMA/MIB browser or ONA drill-down |
| Cached `status.json` for WAN-down consultation | Central control plane / Fracta authority |
| Firefox home window (reversible fullscreen via labwc) | Locked-down kiosk with no desktop access |
| **Step 1** of a future control-room UI | Full “La Nasa” multi-panel ops console |

**Next steps:** SNMP-like management agents + global/zoom web UI — **P0 contract:**
[control-room-mib-lite-v0.md](control-room-mib-lite-v0.md). Background:
[operium-node-agent.md](operium-node-agent.md),
[soma-semantic-object-management-architecture.md](soma-semantic-object-management-architecture.md).

## Stabilized deployment (observed 2026-07-30)

| Surface | Value |
|---------|--------|
| Local URL | `http://127.0.0.1/` (portal UI) |
| Boot splash | `http://127.0.0.1/boot.html` (retry until ready, then redirect) |
| Tailnet URL | `http://rpi3-view/` |
| Static root | `/srv/operium-edge-portal` |
| HTTP server | BusyBox `httpd` on port **80** (`CAP_NET_BIND_SERVICE`, user `jh`) |
| Service | `operium-edge-portal.service` (enabled) |
| Refresh timer | `operium-edge-portal-refresh.timer` (~5 min → `status.json`) |
| CGI re-probe | `GET /cgi-bin/refresh` → rewrite `status.json` + return JSON |
| Light HTML (optional) | `GET /cgi-bin/home` (no JS; fallback browsers) |
| Browser | Firefox ESR, profile `~/.mozilla/firefox/operium-edge.profile` |
| Launch | `~/bin/rpi3-view-open-edge-portal.sh` from labwc autostart |
| Desktop | labwc Wayland (`LXDE-pi-labwc`), not a coding node |
| Display | HDMI ~1024×768 (ASUS VH196); compact UI avoids vertical scroll |
| ONA (separate) | `operium-node-agent.service` on `:8794` (SOMA descriptor; not wired into portal UI yet) |

### Baseline verification

```bash
ssh rpi3-view 'systemctl is-active operium-edge-portal.service operium-edge-portal-refresh.timer'
ssh rpi3-view 'curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1/'
ssh rpi3-view 'curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1/boot.html'
ssh rpi3-view 'curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1/status.json'
# From workstation (mesh):
curl -fsS -o /dev/null -w "%{http_code}\n" http://rpi3-view/
```

Expect **active** services and **HTTP 200**.

## Architecture

```text
labwc autostart
  → rpi3-view-open-edge-portal.sh
      wait HTTP 200 on portal
      settle (cold-start / early boot)
      firefox-esr -profile …/operium-edge.profile --new-window http://127.0.0.1/boot.html
          → boot.html retries status.json → redirect to /

systemd: operium-edge-portal.service
  → busybox httpd :80 → /srv/operium-edge-portal
      index.html   (compact control-room home)
      boot.html
      status.json  (last probe snapshot)
      cgi-bin/refresh, cgi-bin/home

systemd: operium-edge-portal-refresh.timer
  → probes Views Store + ping fracta / thinkpad / poco → atomic status.json
```

### Operator interaction (display)

| Action | Behaviour |
|--------|-----------|
| First paint | May take tens of seconds (Firefox cold start on Pi 3); server is usually already up |
| Fullscreen | labwc can toggle fullscreen; **F11** is acceptable manual toggle |
| Leave fullscreen | F11 |
| Minimize / desktop | Super+↓ (labwc `Iconify`) |
| Maximize | Super+↑ |
| Close browser | Alt+F4 |

Do not use Firefox `--kiosk` for this desk display: it blocks easy minimize and
desktop menus.

## Source tree (Operium)

| Path | Role |
|------|------|
| `apps/edge-portal/index.html` | Main compact UI |
| `apps/edge-portal/boot.html` | Boot splash + client retry |
| `apps/edge-portal/cgi-bin/refresh` | On-demand mesh re-probe |
| `apps/edge-portal/cgi-bin/home` | Optional no-JS HTML |
| `scripts/ops/rpi3-view-edge-portal-refresh.sh` | Timer probe writer |
| `scripts/ops/rpi3-view-open-edge-portal.sh` | Wait-for-portal + Firefox launch |
| `scripts/ops/deploy-rpi3-edge-portal.sh` | Deploy static + labwc + opener from workstation |
| `templates/rpi3-view/operium-edge-portal*.service` | systemd unit fragments |
| `templates/rpi3-view/labwc-autostart-edge-portal` | labwc autostart |
| `templates/rpi3-view/labwc-rc.xml.fragment` | fullscreen toggle + keybinds |
| `templates/rpi3-view/firefox-edge-portal-user.js` | no session-restore dialog after hard reboot |
| `profiles/tools.rpi3-view.v1.yaml` | node tool/profile registry |

## Deploy / refresh

From a workstation with mesh SSH and a current Operium checkout:

```bash
cd operium
bash scripts/ops/deploy-rpi3-edge-portal.sh
```

- Static HTML/CGI: live after deploy (browser reload).
- labwc `rc.xml` / autostart: re-login or reboot the Pi.

## Degraded mode

`status.json` is written atomically. If Internet / mesh disappears, the local
page and last completed snapshot remain available. Reachability is **not** deep
service health — only ping / public Views Store health style probes.

## Relationship to ONA / SOMA

| Layer | On rpi3-view (2026-07-30) | Used by edge portal UI? |
|-------|---------------------------|-------------------------|
| Edge portal | yes | **yes** (this doc) |
| ONA `:8794` | yes (SOMA profile, runtime artifact) | **no** (not yet) |
| SOMA `/.well-known/soma` | yes | **no** |
| `/soma/object` | requires read token | **no** |

Wiring the control-room UI to ONA/SOMA (global fleet view + node zoom / “MIB”
browser) is **step 2** — contract:
[control-room-mib-lite-v0.md](control-room-mib-lite-v0.md).

## Related

- [Fractanet mesh](fractanet-mesh.md) — node roles, Paoli edge-kiosk
- [Fractanet control center](fractanet-control-center.md) — broader control-room ambition
- [Operium Node Agent](operium-node-agent.md)
- [SOMA](soma-semantic-object-management-architecture.md)
- Profile: `profiles/tools.rpi3-view.v1.yaml`
