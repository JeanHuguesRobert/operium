---
title: "Hosted Browser POC Architecture (KasmVNC + Chromium + CDP)"
description: "Architecture, isolation model, multi-user separation, and dual human/machine operation for Hosted Browsers on FractaNodes."
layout: default
nav_order: 15
date: 2026-08-26T00:00:00.000Z
last_modified_at: 2026-09-03T00:00:00.000Z
license: CC BY-SA 4.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/hosted-browser-kasmvnc-cdp.md
document_role: operational
document_kind: architecture-note
visibility: public
lifecycle_state: active
author: "Jean Hugues Noël Robert, baron Mariani"
update_policy: UP-DEFAULT-REVIEWED
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "explicit-metadata"
classification_confidence: "high"
---

# Hosted Browser POC Architecture

## 1. Vision & Core Invariant

The Hosted Browser decouples personal browsing and agent automation from physical client hardware:

> **The personal environment belongs to the person, not to the physical terminal.**

A Hosted Browser session provides two symmetric access surfaces to the same underlying browser state:
1. **Human Interaction Surface**: Ultra low-latency web UI via **KasmVNC** (open-source GPL-2.0).
2. **Machine Automation Surface**: Scoped, local-only **Chrome DevTools Protocol (CDP)** for autonomous agents.

```mermaid
graph TD
    subgraph "Client Tier"
        Human["Human User (Old PC / Laptop / Tablet)"]
        Agent["Autonomous Agent (John / Codex / Antigravity)"]
    end

    subgraph "FractaNode Tier (fracta2 / Ubuntu Linux)"
        VNC["KasmVNC Server (Websocket 127.0.0.1:8444)"]
        CDP["Native CDP Port (127.0.0.1:9223)"]
        Chromium["Google Chrome (Chromium fallback)"]
        Profile["Persistent Profile (/home/user/.hosted-browser)"]
        Caddy["Caddy reverse proxy (optional public HTTPS)"]
    end

    Human -->|"HTTPS / WebSocket (KasmVNC UI)"| Caddy
    Agent -->|"Fractanet Wire / Tailscale"| CDP
    Caddy --> VNC
    VNC --> Chromium
    CDP --> Chromium
    Chromium <--> Profile
```

---

## 2. Multi-User Isolation & Security Constraints

* **Strict Unix Account Separation**: Each person gets a dedicated Unix UID (canonical form `hosted-<gmail-local-part-without-dots>`). Legacy names such as `hosted-jhr` remain valid until migrated.
* **Profile Privacy**: `chmod 700 /home/${USER}/.hosted-browser`. Cookies, session tokens, and localStorage never leak across users.
* **CDP Scoping**: CDP is bound exclusively to `127.0.0.1` or the Fractanet Tailscale mesh. It is **never** exposed to the public Internet.
* **Exclusion of Kasm Workspaces**: The deployment intentionally uses only standalone **KasmVNC (GPL-2.0)** without proprietary Kasm Workspaces or heavy Docker/OCI layers.

### Identities (do not conflate)

| Identity | What it is | What it is not |
|----------|------------|----------------|
| Unix account | Workspace owner UID, home, systemd `User=` | The KasmVNC login prompt |
| Hosted Browser workspace | Persistent Chrome profile + display + ports | A Cogentia Principal or Twin |
| KasmVNC user | HTTP Basic login = Gmail local part `uuuu` | Unix account, Google session, or Principal |
| Google / site sessions | Created by a human inside Chrome | Something the provisioner logs into |

Default isolation is **one person / one Unix workspace / one write-capable KasmVNC login**. Extra KasmVNC viewers on the same display are an explicit grant (`vncpasswd -u …`), not the way to give a second person their own browser.

### What the public password prompt is

Observed 2026-09-03: `https://browser.fractavolta.com/` returns **HTTP 401** `WWW-Authenticate: Basic realm="Websockify"` behind two Caddy hops. That prompt is **KasmVNC HTTP Basic** from the workspace `~/.kasmpasswd` file. It is not Unix `login(1)` and not Cogentia.

Temporary lab password (issue #25, until a later auth scheme): for Gmail `uuuu@gmail.com` the Websockify username is `uuuu` and the password is `sesame-uuuu`. This is the same *family* as other Operium lab sesames. It is **not a security boundary**. Anyone who knows the Gmail local part can derive the password. Do not treat the public hostname as protected by this prompt. Google sign-in inside Chrome is a separate human step and is not this password.

Display `N` binds KasmVNC HTTP/WebSocket to `127.0.0.1:(8443+N)`, Chrome CDP to `127.0.0.1:(9222+N)`, optional RFB to `127.0.0.1:(5900+N)`. Display `:1` is therefore `:8444` / `:9223` / `:5901`. Only a chosen KasmVNC HTTP port may be published; RFB and CDP stay off the public Internet.

### Session mode vs assurance (issue #49)

The X session is a **Hosted Workspace**. Chrome is an application, not the session process.

| Knob | Values | Role |
|------|--------|------|
| `HOSTED_SESSION` | `kiosk` (default) or `desktop` | Kiosk: Chrome only, restart on exit with cooldown. Desktop: Openbox is the session; right-click menu Chrome / terminal / restart Chrome / logout. |
| `HOSTED_ASSURANCE` | `lab-sesame` (now), `mesh-session`, `future-idp` | How strongly we believe the person at the prompt. Future auth **opens** capacities; it does not rewrite the launcher. |

Fail closed (`scripts/ops/hosted-workspace-policy.sh`):

- `desktop` on `lab-sesame` + public bind is refused unless `HOSTED_ASSURANCE_WAIVER=principal-lab`.
- Host admin / sudo on the Chrome UID is never a workspace capacity.
- Lowering assurance must close desktop again (re-run configure).

```bash
sudo scripts/ops/configure-hosted-browser-workspace.sh \
  --unix hosted-someone --session kiosk --dry-run
sudo scripts/ops/configure-hosted-browser-workspace.sh \
  --unix hosted-jeanhuguesrobert --session desktop --bind public \
  --assurance lab-sesame --waiver principal-lab --restart
```

New workspaces provision as kiosk. Do not grant desktop to a regular user on the public sesame prompt.

### Generic workspace provisioning

Use `scripts/ops/provision-hosted-browser-user.sh` after the node-level
KasmVNC templates are installed. A canonical Gmail address is required
(`uuuu@gmail.com`, no plus-alias). The Unix account is
`hosted-<uuuu-without-dots>`. The provisioner writes the lab KasmVNC
login with `vncpasswd` / `kasmvncpasswd` on the node. It never receives a
Google password, creates a Google account, or signs into Google.

```bash
sudo scripts/ops/provision-hosted-browser-user.sh \
  --gmail person@gmail.com \
  --display 3 \
  --dry-run
```

Dry-run prints the Websockify user and `sesame-<uuuu>` formula. Remove
`--dry-run` only after the display is free. Optional
`--kasm-password-file` overrides the lab sesame when a later auth scheme
lands. `--with-rfb` still needs a separate classic RFB password file
(TigerVNC/x11vnc truncates; do not reuse the sesame there).

The web-facing Caddy route is a separate operational decision: a newly
provisioned workspace is not automatically made public. Optional fragment:
`templates/hosted-browser/Caddyfile.browser.fragment`.

Legacy Unix names (`hosted-jhr`) migrate with
`scripts/ops/migrate-hosted-browser-user.sh`. `--password-only` rewrites
sesame on the existing account; the default path renames user/group/home
to `hosted-<gmail-key>` and keeps the Chrome profile. `--test-local`
checks `https://127.0.0.1:(8443+display)/` (KasmVNC speaks TLS on that
port; plain HTTP is empty).

Observed 2026-09-04 on `fracta2`: `hosted-jhr` →
`hosted-jeanhuguesrobert` on display `:1`. Local TLS Websockify returned
200 for the lab sesame and 401 otherwise. `hosted-nasa` was left
unchanged.

### List, rotate, revoke

```bash
sudo scripts/ops/list-hosted-browser-workspaces.sh
sudo scripts/ops/list-hosted-browser-workspaces.sh --json
```

Listing reads `/etc/operium/hosted-browser/*.env` and systemd active state. It
does not open password files.

**Rotate** while the lab sesame is in force by re-running the provisioner
(same Gmail + display) or by writing `~/.kasmpasswd` with `vncpasswd -u uuuu -w`
and password `sesame-uuuu`, then restarting `hosted-browser@<unix>.service`.
File edits are **not** applied live. When the future auth scheme lands, stop
using this formula and treat remaining `sesame-*` files as expired.

**Revoke an extra KasmVNC viewer** (same workspace, not a second person):

```bash
sudo vncpasswd -u viewer -d /home/<unix>/.kasmpasswd
sudo systemctl restart hosted-browser@<unix>.service
```

**Disable a workspace** without deleting the credential-bearing Chrome profile:

```bash
sudo systemctl disable --now hosted-browser@<unix>.service
```

Do not `userdel -r` or delete `~/.hosted-browser` unless a human has accepted
loss of that profile. If a Caddy site was published for that display, remove
that site in the same change; provision never added it.

---

## 3. Checkpoints & Verification Criteria

| Checkpoint | Target Property | Verification Method |
|---|---|---|
| **Checkpoint A** | Resilient FractaNode baseline | Host online on Tailscale mesh, zero swap pressure, monitored by Operium. |
| **Checkpoint B** | Persistent Single-User Session | Human logs into services (Gmail/ChatGPT), restarts systemd service, verifies session persistence. |
| **Checkpoint C** | Multi-User Independence | 2 separate users running simultaneously on distinct displays/ports with zero cross-talk. |
| **Checkpoint D** | Dual Human/Machine Control | Human interacts via KasmVNC while local script navigates and reads DOM via CDP. |

---

## 4. Resource Baseline & Performance Targets
 
* **Idle footprint per user**: ~180 MB RAM (Chromium base + KasmVNC daemon).
* **Active browsing footprint**: ~450 MB – 850 MB RAM per active tab cluster.
* **Network consumption**: ~15–40 KB/s during text typing/reading; ~120 KB/s on full redraws.

### Observed Live Baseline (`fracta2` — 2026-08-26)

| Parameter | Observed Live Value | Notes |
|---|---|---|
| **Host / OS** | `fracta2` · Ubuntu 24.04 LTS (x86_64) | OCI Marseille `VM.Standard.E2.1.Micro` |
| **KasmVNC** | v1.5.0-1 | Port :8444 / HTTP :80 via Caddy |
| **Chromium Engine** | Google Chrome 152.0.7977.64 | CDP :9223 active |
| **Window Manager** | Openbox lightweight WM | Minimal memory footprint |
| **Framerate & Codec** | 24 FPS · JPEG `quality: 6` | `nearest` video encoder, low CPU overhead |
| **Memory Allocation** | 1 GB RAM + 4 GB NVMe Swap | 432 MB free RAM nominal |
| **CPU Utilization** | **~91% CPU Idle (0% Steal)** | Stable under continuous session |
| **Control Plane** | ONA (:8794) + SOMA discovery | Advertises to fracta Blackboard every 3 min |
