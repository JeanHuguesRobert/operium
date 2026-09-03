---
title: "FractaNode 2 (fracta2) Provisioning & Hosted Browser Bootstrap Runbook"
description: "Step-by-step runbook for provisioning fracta2, joining Fractanet, and deploying the Hosted Browser stack."
layout: default
nav_order: 16
date: 2026-08-26T00:00:00.000Z
last_modified_at: 2026-09-03T00:00:00.000Z
license: CC BY-SA 4.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/fracta2-node-bootstrap.md
document_role: operational
document_kind: runbook
visibility: public
lifecycle_state: active
author: "Jean Hugues Noël Robert, baron Mariani"
update_policy: UP-DEFAULT-REVIEWED
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "explicit-metadata"
classification_confidence: "high"
---

# FractaNode 2 (fracta2) Bootstrap Runbook

## 1. Node Provisioning & OS Baseline

* **Target OS**: Ubuntu 24.04 LTS (x86_64)
* **Packages**:
  ```bash
  sudo apt update && sudo apt install -y \
    curl git caddy libx11-6 x11-xserver-utils xauth
  # Live fracta2 uses Google Chrome 152; Chromium is the launcher fallback.
  # Install google-chrome-stable from Google's repo, or chromium-browser.
  ```

## 2. Install KasmVNC

```bash
KASMVNC_VER="1.5.0"
wget "https://github.com/kasmtech/KasmVNC/releases/download/v${KASMVNC_VER}/kasmvncserver_noble_${KASMVNC_VER}_amd64.deb"
sudo apt install -y ./kasmvncserver_noble_${KASMVNC_VER}_amd64.deb
rm kasmvncserver_noble_${KASMVNC_VER}_amd64.deb
```

## 3. Join Fractanet Mesh

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --hostname=fracta2 --accept-routes
```

## 4. Install Hosted Browser Template & Scripts

```bash
sudo mkdir -p /opt/operium/bin
sudo cp templates/hosted-browser/start-hosted-browser.sh /opt/operium/bin/
sudo chmod +x /opt/operium/bin/start-hosted-browser.sh
sudo cp templates/hosted-browser/hosted-browser@.service /etc/systemd/system/
sudo systemctl daemon-reload
```

## 5. Instantiate a Personal Hosted Browser

Do not hand-create `hosted-jhr` for new people. Use the provisioner in
[`hosted-browser-kasmvnc-cdp.md`](hosted-browser-kasmvnc-cdp.md) (issue #25):
create private `vncpasswd` / RFB files, `--dry-run`, then apply. Copy the
script to the node first:

```bash
sudo install -m 0755 scripts/ops/provision-hosted-browser-user.sh \
  /opt/operium/bin/provision-hosted-browser-user.sh
sudo install -m 0755 scripts/ops/list-hosted-browser-workspaces.sh \
  /opt/operium/bin/list-hosted-browser-workspaces.sh
```

`hosted-jhr` on display `:1` is a **legacy** workspace name. Leave it running
until a human-validated migration copies its Chrome profile into a canonical
`hosted-<gmail-key>` account and switches any public Caddy route. Google sign-in
inside Chrome remains a human step.

```bash
sudo /opt/operium/bin/list-hosted-browser-workspaces.sh
sudo systemctl status 'hosted-browser@*.service'
```

## 6. Configure a Dedicated La Nasa Workspace

The template accepts a per-workspace, non-secret environment file. This keeps
the Unix workspace identity separate from its display number and initial page.

```bash
sudo install -d -o root -g root -m 0755 /etc/operium/hosted-browser
sudo cp templates/hosted-browser/hosted-browser.env.example \
  /etc/operium/hosted-browser/hosted-nasa.env
sudoedit /etc/operium/hosted-browser/hosted-nasa.env
```

Allocate a unique `HOSTED_BROWSER_DISPLAY` (for example `2`). Set
`HOSTED_BROWSER_START_URL` to the observer perspective required:

- `http://127.0.0.1:8794/` when the La Nasa observer is `fracta2` itself;
- `http://rpi3-view:8794/` when the observer is `rpi3-view`.

A literal `127.0.0.1` is local to the Hosted Browser host. Do not use it to
refer to another node; use that node's allow-listed mesh origin or a separately
configured authenticated tunnel/proxy.
