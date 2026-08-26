---
title: "FractaNode 2 (fracta2) Provisioning & Hosted Browser Bootstrap Runbook"
description: "Step-by-step runbook for provisioning fracta2, joining Fractanet, and deploying the Hosted Browser stack."
layout: default
nav_order: 16
date: 2026-08-26T00:00:00.000Z
last_modified_at: 2026-08-26T00:00:00.000Z
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
    curl git chromium-browser caddy libx11-6 x11-xserver-utils xauth
  ```

## 2. Install KasmVNC

```bash
KASMVNC_VER="1.3.2"
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

```bash
# Create dedicated user account
sudo useradd -m -s /bin/bash hosted-jhr
sudo usermod -aG kasmvnc-cert hosted-jhr

# Enable and start user session on display :1
sudo systemctl enable --now hosted-browser@hosted-jhr.service

# Verify status
sudo systemctl status hosted-browser@hosted-jhr.service
```
