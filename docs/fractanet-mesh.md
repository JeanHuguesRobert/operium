---
title: "Fractanet mesh — Tailscale and SSH (July 2026)"
description: "Operational record of the virteal tailnet, bidirectional SSH mesh, capable-host wiring, and Packet Attractor Phase 1 on fracta."
layout: default
date: 2026-07-04
last_modified_at: 2026-07-05
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/fractanet-mesh.md
document_role: "operational"
document_kind: "method"
visibility: "public"
lifecycle_state: "active"
status: "mesh live (4 nodes)"
---

# Fractanet mesh — Tailscale and SSH (July 2026)

This note records **observed operational state** after resuming [Fractanet resumption handoff](../research/fractanet-resumption-2026-07.md) in July 2026. It belongs in **Operium** (infrastructure memory).

Companion notes:

- [Fracta trust perimeter and secrets](fracta-trust-perimeter.md) — `guide.env`, Phase 4 retrieval
- [Fractanet resumption handoff](../research/fractanet-resumption-2026-07.md) — north star and open decisions
- [Public / private split](public-private-split.md) — secret references, not values
- Cogentia scripts: `cogentia/scripts/ops/` (bootstrap, heartbeat, Windows SSH install)
- Private node catalogue: `registre-mariani/operium/registry/resources.yaml` (canonical, private git); local default `~/.cogentia/registry/resources.yaml` via `OPERIUM_REGISTRY`

---

## Purpose

Fractanet nodes must reach each other **without a single fixed URL** and **without exposing SSH on the public Internet** for routine ops. The July 2026 bootstrap uses:

1. **Tailscale** (tailnet `virteal`, future org `fractanet`) — private L3 mesh between nodes
2. **OpenSSH** on each node — operator and inter-node access over Tailscale IPs
3. **Shared mesh identity** (`fractanet-mesh` ed25519 key) — one key pair for node-to-node SSH (operator trust model)

This is **bootstrap transport**, not the target Packet Attractor routing layer.

---

## Tailnet naming (observed 2026-07-04)

Three distinct identifiers — do not confuse them:

| Field | Current value | Mutable? | Used for |
|-------|---------------|----------|----------|
| **Legacy ID** | `virteal.org.github` | **No** (Tailscale assigns at creation) | Admin console header, `operium` probe `tailnet`, API Tailnet ID |
| **Display name** | `Fractanet` | Yes — [Settings → General](https://login.tailscale.com/admin/settings/general) | Client UI, login page (cosmetic) |
| **Tailnet ID** (API) | kept in private registry | **No** | [Tailscale API](https://tailscale.com/docs/reference/tailscale-api) calls |
| **MagicDNS suffix** | `bigscale-pythagorean.ts.net` | Yes — [DNS → Rename tailnet](https://login.tailscale.com/admin/dns) | FQDNs like `fracta.<suffix>` |

MagicDNS is **enabled**. Short names (`ping fracta`) resolve via the suffix. Tailscale offers **random** replacement suffixes (e.g. `cat-crocodile.ts.net`) — you cannot pick `fractanet.ts.net` free-form.

**Rename (2026-07-04):** suffix `tailfbacd8.ts.net` → `bigscale-pythagorean.ts.net`. Tailscale IPs unchanged; mesh verified post-rename.

### Rename procedure (operator, admin console)

1. [DNS](https://login.tailscale.com/admin/dns) → **Rename tailnet** → confirm.
2. **Re-roll options** until a suffix you like appears; select it → **Rename tailnet**.
3. [General](https://login.tailscale.com/admin/settings/general) → display name `Fractanet` → **Save**.
4. Wait ~1 min; on each node run `tailscale status` (no reinstall needed).
5. Post-rename checks (workstation):

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" status --json |
  ConvertFrom-Json | Select-Object -ExpandProperty CurrentTailnet
ping fracta
ssh fracta hostname
ssh fracta 'curl -fsS http://<thinkpad-tailscale-ip>:8792/health'
cd C:\tweesic\operium; node bin/operium.js up --human
```

6. Update private registry `~/.cogentia/registry/resources.yaml` → `transport.magic_dns_suffix`.

---

## Tailscale admin settings (observed 2026-07-04)

Trial plan (~14 days left at observation). Configured in [Settings](https://login.tailscale.com/admin/settings/general) unless noted.

### DNS ([admin/dns](https://login.tailscale.com/admin/dns))

| Setting | Value | Note |
|---------|-------|------|
| MagicDNS | **ON** | Suffix `bigscale-pythagorean.ts.net`; search domain injected on clients |
| Global nameservers | **none** | Clients keep local DNS for public domains |
| Override DNS servers | **OFF** | Do not enable on laptop — would break LAN resolution |
| Split DNS `ts.net` | automatic | Tailscale resolver `199.247.155.53` — no manual entry |
| HTTPS certificates | **OFF** | Prod TLS via Caddy/`fractavolta.com`; tailnet HTTPS optional later |

**Policy:** MagicDNS for mesh hostnames only; `fractavolta.com` stays on Gandi public DNS. Service wiring (`guide.env`, SSH) prefers **Tailscale IPs** (`100.x`) for stability.

### Feature previews (General → Feature previews)

| Feature | State | Rationale |
|---------|-------|-----------|
| **Send Files** (Taildrop) | **ON** | P2P encrypted file transfer between own devices |
| Funnel | OFF | Public ingress already via Caddy; extra attack surface |
| Mullvad VPN | OFF | Paid exit nodes — out of scope |
| Join external tailnets | OFF | Not needed |
| Services Collection | OFF | Alpha inventory — enable later if useful |
| Public IP device posture | OFF | No posture ACLs; adds PII |

### Auth keys ([Settings → Keys](https://login.tailscale.com/admin/settings/keys))

Auth keys (`tskey-auth-…`) are **invitation tokens** to join new machines. They are **not** the per-device private keys (those stay on each node and never appear in this list).

| Key ID | Created | Expiry | Type | Status |
|--------|---------|--------|------|--------|
| `kMDGHHezga11CNTRL` | 2026-07-04 | 2026-10-02 | **Reusable** | **Revoked 2026-07-05** |

`fracta`, `i7-thinkpad-jhr`, `rpi3-view`, and `poco-jhr` enrolled via this bootstrap key (Android via GitHub login in app). **Revoking it does not disconnect enrolled machines** — each node keeps its own device key.

**Bootstrap complete (2026-07-05):** all planned nodes enrolled; bootstrap key revoked. Future nodes → **one-off** auth keys only (generate per device in [Settings → Keys](https://login.tailscale.com/admin/settings/keys)).

No API access tokens configured.

### Device management ([admin/settings/device-management](https://login.tailscale.com/admin/settings/device-management))

| Setting | State | Note |
|---------|-------|------|
| Device Approval | **OFF** | Solo operator; enable later if untrusted joins become a concern |
| Tailnet Lock | **OFF** | Manual trust of every device key — high friction; not needed at bootstrap |
| Key Expiry | **180 days** | GitHub re-auth interval; default max |
| Auto-update new devices | default | Existing nodes unaffected |
| **Device Identity Collection** | **ON** | **2/2 opted-in**; posture attrs visible in admin Machine Details (verified 2026-07-04) |
| Posture integrations | none | CrowdStrike / Intune / Jamf — not used |
| Posture conditions (`srcPosture`) | none | ACL posture rules not configured |

**Device Identity Collection** gathers hardware identifiers (serial, MAC when needed) for inventory and third-party posture integrations. It does **not** auto-enroll: each device must opt in.

| Platform | Opt-in |
|----------|--------|
| Linux (`fracta`) | `sudo tailscale set --posture-checking=true` then reconnect |
| Windows (`i7-thinkpad-jhr`) | `tailscale set --posture-checking=true` then reconnect (or MDM policy `PostureChecking=always`) |
| Android / iOS | **No serial via app** (OS sandbox); default posture attrs (`node:os`, `node:osVersion`, …) still collected. Serial requires MDM on managed fleets. |

**Opt-in applied (2026-07-04):**

```powershell
# i7-thinkpad-jhr
& "C:\Program Files\Tailscale\tailscale.exe" set --posture-checking=true
& "C:\Program Files\Tailscale\tailscale.exe" down
& "C:\Program Files\Tailscale\tailscale.exe" up
```

```bash
# fracta (use public SSH if connected over Tailscale)
sudo tailscale set --posture-checking=true
sudo tailscale down --accept-risk=lose-ssh
sudo tailscale up
```

`PostureChecking: true` verified on both nodes. Admin **Machine Details** now shows posture attributes (`node:os`, `node:osVersion`, `node:tsVersion`, …). Hardware identifiers, when present, stay in the private registry.

Next: map Tailscale machine attrs → Operium `resources.yaml` fields when catalogue sync is implemented.

### Access controls

Default permissive tailnet (solo operator). No `funnel` node attribute. Device approval not required.

---

## Tailnet inventory (observed 2026-07-05)

| Hostname | OS | Tailnet role | WAN | SSH mesh | Other services |
|----------|-----|--------------|-----|----------|----------------|
| `fracta` | Ubuntu VPS (OCI) | always-on public face | **own** public WAN | inbound + outbound :22 | Cogentia Guide MCP, blackboard aggregator |
| `i7-thinkpad-jhr` | Windows 11 | intermittent capable host | **via phone** (typical) | inbound + outbound :22 | `inox-serve` :8792, attractor heartbeat |
| `rpi3-view` | Raspberry Pi OS (Pi 3) | **site edge / kiosk** | **via phone** or Paoli LAN | inbound + outbound :22 | Local 1 cours Paoli — sole always-on node on LAN; see [Linux node roles](#linux-node-roles-corpus--paoli) |
| `poco-jhr` | Android Termux (POCO X6 5G) | **capable-mobile + WAN hub** | **cellular 5G → shared to mesh** | inbound + outbound :8022 | Corpus mirror, coding agents; layout `~/srv/cogentia` |

**Enrollment order:** Pi 3 → Android phone → revoke bootstrap auth key — **done 2026-07-05**.

Tailscale IPs and LAN addresses live in the **private** registry only. MagicDNS short names (`ssh fracta`, `ssh rpi3-view`, `ssh poco-jhr`) work when enabled in the tailnet admin console.

**Health (2026-07-05):** four nodes enrolled on tailnet `virteal.org.github` (display name **Fractanet**). fracta reaches the laptop `inox-serve` health endpoint over Tailscale when the ThinkPad is online. `poco-jhr` outbound mesh SSH to fracta/thinkpad/Pi verified; inbound via Termux `:8022` when the app stays alive.

---

## Embryon Fractanet — node capability matrix

Per-node **observed** capabilities of the four-node embryon. Hardware figures are operator-measured unless noted. Secret paths and IPs stay in the private catalogue (`registre-mariani/operium/registry/resources.yaml`).

### WAN topology

Unlike a classic home LAN where the router provides WAN, this embryon uses the **operator phone as the mobile WAN gateway** for field nodes. Only `fracta` has its own always-on public Internet.

```text
                    Internet (public)
                          |
            +-------------+-------------+
            |                           |
        fracta (OCI)              poco-jhr (5G)
        own WAN                   WAN hub / hotspot
            |                           |
            |    Tailscale mesh (100.x) |
            +-------+-------+-----------+
                    |       |
            i7-thinkpad-jhr  rpi3-view
            (intermittent)   (Paoli edge, LAN anchor)
            typical WAN:     typical WAN:
            phone tether     phone or Paoli LAN
```

When the phone is offline or Termux is killed, **ThinkPad and Pi lose WAN** unless another path exists (Paoli LAN only helps `rpi3-view` locally; it does not restore fracta reachability for domotics sync).

### `fracta` — corpus-publisher

| Dimension | Observed capability |
|-----------|---------------------|
| **Hardware** | OCI VPS; ~1 GB RAM (Guide daemon timeout risk on `/guide/health`) |
| **WAN** | Independent public IP; Caddy + `fractavolta.com` |
| **Corpus** | Publisher: `/srv/cogentia/repos` ~3.1 G, 17 repos; build index, sync `cogentia-public` |
| **SSH mesh** | Ubuntu `sshd` :22; `fractanet-mesh` inbound + outbound; survives reboot |
| **Cogentia services** | Guide MCP :8791, Phase 1 blackboard (`/ops/blackboard`), ops dashboard |
| **Retrieval** | Static `guide.env` → ThinkPad `inox-serve` over Tailscale (Phase 4 bootstrap) |
| **Coding agents** | Server-side Node tooling only; not an operator dev workstation |
| **Limits** | No `inox-serve` locally; Supabase keys may remain as transitional fallback; not a capable retrieval host |

### `i7-thinkpad-jhr` — capable-retrieval-host

| Dimension | Observed capability |
|-----------|---------------------|
| **Hardware** | ThinkPad, Intel i7-5600U (2015), 8 GB RAM; **~8 GB disk free** (critical) |
| **WAN** | Typically tethered via `poco-jhr`; intermittent power |
| **Corpus** | Dev working copies; not a full fracta mirror |
| **SSH mesh** | Windows OpenSSH `sshd` :22; `fractanet-mesh`; firewall `OpenSSH-Server-In-TCP` |
| **Cogentia services** | `inox-serve` :8792 (`InoxServeCapableHost` task); attractor heartbeat every 3 min |
| **Retrieval profile** | `inox.session.v1` — embeddings, Supabase RPC inline |
| **Blackboard** | `attractor:i7-thinkpad-jhr:retrieval-inline` |
| **Coding agents** | Full operator stack (Grok, Codex, Claude Code, etc.) on Windows |
| **Limits** | Offline → fracta Guide needs fallback policy A/B/C; disk space tight |

### `rpi3-view` — edge-kiosk (Paoli)

| Dimension | Observed capability |
|-----------|---------------------|
| **Hardware** | Raspberry Pi 3, ARMv7, 1 GB RAM |
| **WAN** | Paoli LAN; Internet typically via phone when on site |
| **Corpus** | **Consumer** role — local mirror **not yet deployed**; target periodic `rsync` from fracta |
| **SSH mesh** | Raspberry Pi OS `sshd` :22; full mesh parity (inbound + outbound) |
| **Cogentia services** | **Target:** `viewer.env`, domotics stack, kiosk; attractor `attractor:rpi3-view:site-edge` |
| **Degraded mode** | When WAN down: local domotics + cached corpus slice; no fracta/Supabase dependency |
| **Limits** | No `inox-serve`, no full index build, no public Guide; ARMv7 / 1 GB constraints |

### `poco-jhr` — capable-mobile + WAN gateway

| Dimension | Observed capability |
|-----------|---------------------|
| **Hardware** | POCO X6 5G; Snapdragon 7s Gen 2; **7 GB RAM**; **~149 GB storage free** |
| **WAN** | **Primary cellular WAN** for embryon; shares connectivity to ThinkPad/Pi via hotspot/tether |
| **Corpus** | Full mirror `~/srv/cogentia/repos` ~3.1 G (17 repos, synced from fracta) |
| **SSH mesh** | Termux `sshd` :8022, user `jh`; `~/.termux/boot/sshd`; outbound mesh to all peers |
| **Layout** | `~/srv/cogentia`, `~/.cogentia/var` (`fractanet-termux-layout.sh`) |
| **Coding agents** | See [Mobile dev environment](#mobile-dev-environment-poco-jhr) |
| **Cogentia services** | No `inox-serve` or blackboard heartbeat yet — research track |
| **Limits** | Termux sshd dies if app killed; port 8022 excluded from `verify-fractanet-ssh-mesh.ps1`; Codex/Claude run in Ubuntu proot (not native Termux) |

### Capability summary (quick reference)

| Capability | fracta | thinkpad | rpi3-view | poco-jhr |
|------------|:------:|:--------:|:---------:|:--------:|
| Tailscale mesh | ✓ | ✓ | ✓ | ✓ |
| SSH mesh (bidirectional) | ✓ | ✓ | ✓ | ✓ (:8022) |
| Own WAN | ✓ | — | — | **hub** |
| Corpus publisher | ✓ | — | — | — |
| Corpus full mirror | — | — | planned | ✓ |
| `inox-serve` / inline retrieval | — | ✓ | — | — |
| Blackboard heartbeat | aggregate | ✓ | planned | — |
| Public Guide / Caddy | ✓ | — | — | — |
| Paoli degraded anchor | — | — | ✓ | — |
| Coding agents (Grok/Codex/Claude) | — | ✓ | — | ✓ |
| Domotics (local) | — | — | planned | — |

---

## SSH mesh architecture

```text
                         virteal tailnet (100.x.x.x)
    +------------------+------------------+------------------+
    |                  |                  |                  |
 i7-thinkpad-jhr     fracta           rpi3-view          poco-jhr
 (admin, Windows)   (ubuntu, VPS)    (jh, Pi — Paoli)   (jh, Termux)
 sshd :22           sshd :22         sshd :22           sshd :8022
 inox-serve :8792   Guide :8791      kiosk / domotics   corpus + agents
    |                  |             (degraded)         WAN hub (5G)
    +------------------+------------------+------------------+
              fractanet-mesh key pair (ed25519)
         (private key on each node; pubkey in authorized_keys)
```

### SSH aliases (operator workstation)

Local `~/.ssh/config` on the trusted workstation defines:

| Alias | Target | User | Key |
|-------|--------|------|-----|
| `fracta` / `fracta-ts` | Tailscale IP of fracta | `ubuntu` | `fractanet-mesh` |
| `fracta-public` | OCI public IP (break-glass) | `ubuntu` | `oci-fracta-instance-jh1` |
| `thinkpad-ts` / `i7-thinkpad-jhr` | Tailscale IP of laptop | `admin` | `fractanet-mesh` |
| `rpi3-view` | MagicDNS hostname | `jh` | `fractanet-mesh` |
| `poco-jhr` | Tailscale IP, port **8022** | `jh` | `fractanet-mesh` |

Routine ops use **Tailscale aliases** (`ssh fracta`). Public IP SSH remains for break-glass and initial bootstrap.

**Android note:** `poco-jhr` runs **Termux sshd** on port 8022 (not the standard mesh port 22). It is **not** included in `verify-fractanet-ssh-mesh.ps1`. Termux sshd stops if the app is killed unless `~/.termux/boot/sshd` is installed (wake-lock + sshd).

### Mesh key (reference only)

| Item | Location (private, not in git) |
|------|--------------------------------|
| Key id | `fractanet-mesh` (ed25519) |
| Operator copy | `~/.cogentia/secrets/fractanet-mesh` (+ `~/.ssh/fractanet-mesh`) |
| fracta copy | `~/.ssh/fractanet-mesh` (ubuntu) |
| Authorized on Linux nodes | `~/.ssh/authorized_keys` |
| Authorized on Windows admin | `C:\ProgramData\ssh\administrators_authorized_keys` |

**Never** commit the private key or Tailscale auth keys. Rotate `fractanet-mesh` if leaked.

### SSH server boot persistence (verified 2026-07-04)

| Node | Inbound sshd | Survives reboot |
|------|--------------|-----------------|
| `i7-thinkpad-jhr` | Windows OpenSSH `sshd` — **Running**, **Automatic**; firewall `OpenSSH-Server-In-TCP` enabled | Config verified (`install-fractanet-ssh-windows.ps1`); laptop reboot not executed this session |
| `fracta` | Ubuntu `ssh.socket` + `ssh.service` — both **enabled**; listens `0.0.0.0:22` | **Reboot tested** — SSH back ~2 min; `ssh fracta` + `ssh thinkpad` OK post-reboot |

### Verified connectivity (2026-07-04)

| From | To | Command | Result |
|------|-----|---------|--------|
| workstation | fracta | `ssh fracta hostname` | `fracta` |
| workstation | thinkpad | `ssh thinkpad-ts hostname` | `i7-thinkpad-jhr` |
| thinkpad | fracta | outbound `ssh fracta hostname` | `fracta` |
| fracta | thinkpad | `ssh thinkpad hostname` | `i7-thinkpad-jhr` |
| fracta | laptop inox | `curl http://<thinkpad-ts-ip>:8792/health` | OK |

Automated check (workstation):

```powershell
pwsh -File cogentia/scripts/ops/verify-fractanet-ssh-mesh.ps1
```

Post-reboot local-only (sshd + firewall, no remote hops):

```powershell
pwsh -File cogentia/scripts/ops/verify-fractanet-ssh-mesh.ps1 -SkipConnectivity
```

---

## Node setup procedures (implemented scripts)

### Windows capable host (`i7-thinkpad-jhr`)

| Component | Script / task | Notes |
|-----------|---------------|-------|
| Inbound SSH (admin) | `cogentia/scripts/ops/install-fractanet-ssh-windows.ps1` | Requires elevated PowerShell; writes `administrators_authorized_keys` |
| `inox-serve` | `cogentia/scripts/ops/install-inox-serve-windows.ps1` | Scheduled task `InoxServeCapableHost`, port 8792 |
| Attractor heartbeat | `cogentia/scripts/ops/install-attractor-heartbeat-windows.ps1` | Task `CogentiaAttractorHeartbeat`, 3 min interval |
| Secrets | `~/.cogentia/secrets/inox-serve-i7-thinkpad-jhr.env`, `attractor-i7-thinkpad-jhr.env` | Refs in private registry |

`sshd` on Windows: **Running**, startup **Automatic**. Firewall: `OpenSSH-Server-In-TCP` enabled.

### Linux VPS (`fracta`)

| Component | Location / procedure |
|-----------|---------------------|
| Mesh pubkey | `~/.ssh/authorized_keys` |
| Mesh private key | `~/.ssh/fractanet-mesh` (outbound to other nodes) |
| SSH client config | `~/.ssh/config` — hosts `thinkpad`, `rpi3-view`, `fracta` |
| Tailscale | joined via bootstrap auth key (revoked 2026-07-05) |
| Blackboard routes | Caddy + Guide MCP `/ops/blackboard` (Phase 1) |

## Linux node roles (corpus + Paoli)

Symmetric **layout**, asymmetric **capabilities**. Script: `cogentia/scripts/ops/fractanet-linux-layout.sh`.

```text
/srv/cogentia/{repos,secrets,ops,work}
/var/lib/cogentia/{.cogentia,state,cache,logs,.ops}
```

| Role | Node | Corpus | When Internet down |
|------|------|--------|-------------------|
| **publisher** | `fracta` | build index, sync `cogentia-public`, public Guide | N/A (remote VPS) |
| **capable host** | `i7-thinkpad-jhr` | `inox-serve` inline retrieval | intermittent — not site anchor |
| **edge-kiosk** | `rpi3-view` | **consumer** + local cache | **anchor** for Local 1 cours Paoli |

### Local 1 cours Paoli (`rpi3-view`)

Physical site: **Local 1, cours Paoli**. For now **`rpi3-view` is the only node to rely on on that LAN**; exact LAN and Tailscale addresses live in the private registry.

**Degraded mode** (no Internet): Tailscale and `ssh fracta` may fail; the Pi must still run **domotics** and a **local corpus view** (runbooks, operium slice, domotics config) from `/var/lib/cogentia` without Supabase or fracta.

```text
Online                         Degraded (Paoli, no WAN)
────────                       ────────────────────────
fracta syncs corpus ──►        Pi uses last local mirror
ThinkPad inox optional         Pi domotics stack local-only
Pi kiosk full view             Pi kiosk + domotics (cache)
```

**Not on Pi:** public Guide/Caddy, Supabase service role, full index build, `inox-serve` VM pool (ARMv7 / 1 GB).

**On Pi (target):** `viewer.env`, optional `domotics.env`, periodic `rsync` from fracta when online, attractor `attractor:rpi3-view:site-edge` on blackboard when domotics/corpus services are up.

### New Linux node — `rpi3-view` (Raspberry Pi 3)

**Minimum architecture:** Pi joins tailnet + **inbound SSH** (`fractanet-mesh` pubkey) so operator and fracta can `ssh rpi3-view`; **outbound SSH** (mesh private key + `~/.ssh/config`) so Pi reaches `fracta` and `thinkpad`. No Cogentia services required on Pi for this step.

| Layer | Required now? |
|-------|----------------|
| Tailscale + MagicDNS hostname `rpi3-view` | yes |
| `openssh-server`, enabled on boot | yes |
| `fractanet-mesh` in `authorized_keys` | yes |
| `fractanet-mesh` private key on Pi | yes (mesh parity) |
| `inox-serve`, blackboard heartbeat | no (later) |

**Bootstrap path (ThinkPad → Pi on LAN first boot):**

1. Flash Pi OS with SSH enabled (Imager: hostname `rpi3-view`, user **`jh`** on this fleet).
2. Find Pi LAN IP (`ping rpi3-view.local` or router DHCP).
3. From ThinkPad:

```powershell
$env:TAILSCALE_AUTH_KEY = 'tskey-auth-...'   # reusable key; value from admin Keys — not in git
pwsh -File cogentia/scripts/ops/bootstrap-rpi3-view.ps1 -PiLanIp <private-lan-ip> -PiUser jh
```

Or run `fractanet-node-bootstrap.sh` manually on the Pi (see script header).

4. Verify mesh (any peer):

```powershell
ssh rpi3-view hostname                    # -> rpi3-view
ssh fracta 'ssh rpi3-view hostname'
ssh rpi3-view 'ssh fracta hostname; ssh thinkpad hostname'
pwsh -File cogentia/scripts/ops/verify-fractanet-ssh-mesh.ps1   # extend when Pi live
```

5. Update `~/.cogentia/registry/resources.yaml` with Pi `tailscale_ip` once assigned.

Bootstrap auth key revoked 2026-07-05. New nodes: generate a **one-off** key in admin Settings → Keys.

### Termux node — `poco-jhr` (Android capable-mobile)

**Not identical to Linux** — no `apt`, no OpenSSH on port 22, no `/srv` without root. Termux mirrors the Linux layout under `$HOME` and uses **Tailscale Android app** (not `tailscale up` CLI).

| Layer | Linux (`rpi3-view`) | Termux (`poco-jhr`) |
|-------|-------------------|---------------------|
| Tailscale | `tailscale up --auth-key` | Android app (GitHub login) |
| Inbound SSH | `sshd :22` | Termux `sshd :8022` |
| Layout | `fractanet-linux-layout.sh` → `/srv/cogentia`, `/var/lib/cogentia` | `fractanet-termux-layout.sh` → `~/srv/cogentia`, `~/.cogentia/var` |
| Bootstrap | `bootstrap-rpi3-view.ps1` + `fractanet-node-bootstrap.sh` | `bootstrap-poco-jhr.ps1` + `fractanet-termux-bootstrap.sh` |
| Outbound SSH | `~/.ssh/fractanet-mesh` + `~/.ssh/config` | same (installed by bootstrap) |
| `inox-serve` / blackboard | no (Pi) / yes (ThinkPad) | **not yet** — research track |
| Corpus mirror | rsync from fracta (Pi planned) | `fractanet-sync-repos-from-fracta.sh` → `~/srv/cogentia/repos` (~3.1 G) |
| Coding agents | N/A | Grok native; Codex + Claude in Ubuntu proot — see below |

**Minimum mesh parity (done 2026-07-05):** inbound + outbound SSH over Tailscale; layout skeleton; `~/.termux/boot/sshd`.

**Full dev bootstrap (done 2026-07-05):** corpus mirror + coding agents. From ThinkPad:

```powershell
pwsh -File cogentia/scripts/ops/bootstrap-poco-jhr-dev.ps1
```

Or stepwise: `fractanet-sync-repos-from-fracta.sh`, `fractanet-mobile-dev-setup.sh`, `fractanet-mobile-proot-agents.sh`.

From ThinkPad (full provisioning: mesh + Termux:Boot + dev stack):

```powershell
pwsh -File cogentia/scripts/ops/provision-fractanet-mobile.ps1
```

Mesh bootstrap only:

```powershell
pwsh -File cogentia/scripts/ops/bootstrap-poco-jhr.ps1
```

Termux:Boot only (sshd survives phone reboot — requires USB ADB or one tap Install on device):

```powershell
pwsh -File cogentia/scripts/ops/install-termux-boot.ps1
# -Method adb   # phone on USB + USB debugging
# -Method ssh   # download APK on device via SSH, open installer
```

Verify:

```powershell
ssh poco-jhr hostname
ssh poco-jhr "ssh fracta hostname; ssh thinkpad hostname; ssh rpi3-view hostname"
```

**Limits:** Termux sshd dies if the app is killed; no `verify-fractanet-ssh-mesh.ps1` entry (port 8022). Battery/Doze may stop background work — configure Termux wake-lock and Android battery exclusions. Future: `mobile.env`, optional `inox-serve`/attractor on capable-mobile.

### Mobile dev environment (`poco-jhr`)

Operator parity with the ThinkPad for corpus-backed coding sessions on the phone.

| Tool | Runtime | Version (observed) | Command |
|------|---------|-------------------|---------|
| **Grok Build** | Native Termux `linux-aarch64` | 0.2.82 | `grok` |
| **Codex** | Ubuntu 24.04 **proot** + Node 22 | 0.142.5 | `agent-codex` |
| **Claude Code** | Same proot | 2.1.201 | `agent-claude` |

**Why proot for Codex/Claude:** Termux has no `linux-arm64-android` native builds for these CLIs. They run inside Ubuntu proot with `bash --noprofile --norc` and a clean `PATH` so Termux Node does not leak into the container.

**PATH on device:**

```bash
export PATH=$HOME/.local/bin:$HOME/.grok/bin:$PATH
```

**Auth:** credentials copied from the trusted workstation (`~/.grok/auth.json`, `~/.codex/auth.json`, `~/.claude/.credentials.json`); Codex/Claude auth lives under proot `/root/`. Re-login on device if tokens expire.

**Corpus sync** (from phone, when fracta reachable):

```bash
bash ~/fractanet-sync-repos-from-fracta.sh
# rsync ubuntu@fracta:/srv/cogentia/repos/ → ~/srv/cogentia/repos/
```

---

## Cogentia / Fractanet services wired over mesh

### Phase 1 — Packet Attractor blackboard (deployed on fracta)

| Item | State |
|------|-------|
| Store | `cogentia/scripts/lib/packet-attractor-blackboard.js` |
| Guide routes | `GET /ops/blackboard`, `POST /ops/blackboard/upsert` |
| fracta `guide.env` | `COGENTIA_BLACKBOARD_UPSERT_TOKEN`, `COGENTIA_OPS_STATE_DIR` set on node |
| Laptop heartbeat | `scripts/ops/attractor-heartbeat.js` → POST upsert every 3 min |
| Attractor id | `attractor:i7-thinkpad-jhr:retrieval-inline` |

Tests: `pnpm test:blackboard` in cogentia repo.

### Phase 4 bootstrap — inox-serve over Tailscale (deployed)

| Item | State |
|------|-------|
| Capable host | `i7-thinkpad-jhr`, `inox-serve` on `0.0.0.0:8792` |
| fracta `guide.env` | `COGENTIA_INOX_RETRIEVAL_URL=http://<thinkpad-tailscale-ip>:8792`, `COGENTIA_INOX_SERVE_TOKEN` set |
| Reachability | fracta → laptop health OK over tailnet |

**Not yet done:** Guide **dynamic** routing from blackboard snapshot before `session/turn` (Phase 2). Startup still uses static `resolveGuideRetrievalBackend()`.

### Fallback policy when laptop offline

Still **open** — see [resumption handoff](../research/fractanet-resumption-2026-07.md). Supabase keys may still be present on fracta as transitional fallback (option A).

---

## Operium CLI

Portable observer from any trusted workstation:

```bash
cd operium && npm install
node bin/operium.js up --human
node bin/operium.js up --json
```

See [operium-cli.md](operium-cli.md) for `operium.up.v1` schema and exit codes.

---

## Ops dashboard

Browser UI on the fracta Guide MCP (public HTTPS):

| URL | Role |
|-----|------|
| `https://cogentia.fractavolta.com/ops/dashboard` | HTML dashboard — MCP/Guide health, attractors, recent COP events |
| `https://cogentia.fractavolta.com/ops/status` | JSON aggregate for scripts and the dashboard |
| `https://cogentia.fractavolta.com/ops/blackboard` | Raw blackboard snapshot |

Source: `cogentia/scripts/ops/fractanet-dashboard.html`, `cogentia/scripts/lib/fractanet-ops-status.js`. Caddy paths: `deploy/fracta/Caddyfile.snippet`.

Auto-refresh every 30 s. Does not expose secrets or Tailscale topology beyond what attractors advertise.

---

## Operator checklist

```bash
# Mesh SSH
ssh fracta hostname
ssh fracta 'ssh thinkpad hostname'

# Tailscale status (workstation)
"& 'C:\Program Files\Tailscale\tailscale.exe' status"   # Windows
tailscale status                                        # Linux

# Dashboard (browser or JSON)
start https://cogentia.fractavolta.com/ops/dashboard
curl -fsS https://cogentia.fractavolta.com/ops/status | jq .

# Blackboard (raw)
curl -fsS https://cogentia.fractavolta.com/ops/blackboard | jq .

# inox-serve from fracta (Tailscale IP from private registry)
ssh fracta 'curl -fsS http://<thinkpad-ts-ip>:8792/health | jq .'

# fracta stack
ssh fracta 'sudo /srv/cogentia/repos/cogentia/scripts/ops/fracta-guide-stack.sh healthcheck'
```

---

## Risks and hygiene

| Risk | Mitigation |
|------|------------|
| Shared mesh key compromise | Rotate `fractanet-mesh`; redeploy pubkey to all nodes |
| Tailscale auth key leak | Revoke the bootstrap reusable auth key; one-off keys per new node |
| Laptop offline | Guide degradation / Supabase fallback — triage policy A/B/C |
| Windows admin SSH | Only `administrators_authorized_keys`; not user-level `authorized_keys` for admins |
| `/guide/health` 500 on fracta | Separate issue (daemon timeout on 1 GB VPS); does not block mesh or blackboard |

---

## Intended evolutions (not current state)

- ~~Enroll operator Android phone; revoke bootstrap auth key~~ — **done 2026-07-05**
- ~~Android corpus mirror + coding agents (Grok/Codex/Claude)~~ — **done 2026-07-05**
- Map Tailscale posture attrs → Operium catalogue (sync tooling)
- `poco-jhr`: Termux reliability (boot persistence, wake-lock, battery policy)
- `poco-jhr`: `mobile.env`, optional `inox-serve` / attractor — research track
- `rpi3-view`: `viewer.env`, corpus rsync, domotics, site-edge attractor
- ThinkPad disk cleanup (~8 GB free)
- Phase 2: blackboard-aware Guide routing
- Option C fallback policy (attractor routing + explicit degradation)
- Extend `verify-fractanet-ssh-mesh.ps1` for `poco-jhr` :8022 (optional)

---

## Related issues

- [inseme#13](https://github.com/JeanHuguesRobert/inseme/issues/13) — Packet Attractor proto
- [cogentia#42](https://github.com/JeanHuguesRobert/cogentia/issues/42) — Phase 4 Inox mandat

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-04 | Initial note: tailnet live, SSH mesh bidirectional, Phase 1 blackboard + inox Tailscale wiring, Pi template |
| 2026-07-04 | Ops dashboard at `/ops/dashboard` on cogentia.fractavolta.com |
| 2026-07-04 | Tailnet naming section; pre-rename impact verified (IPs stable, no suffix in configs) |
| 2026-07-04 | MagicDNS suffix renamed to `bigscale-pythagorean.ts.net` |
| 2026-07-04 | Admin settings documented: display name Fractanet, DNS policy, Taildrop ON, auth key hygiene |
| 2026-07-04 | Device management + identity collection; enrollment roadmap Pi → Android; auth key kept until then |
| 2026-07-04 | Device Identity opt-in: `PostureChecking=true` on fracta + i7-thinkpad-jhr |
| 2026-07-04 | Device posture attrs confirmed visible in Tailscale admin |
| 2026-07-04 | SSH mesh re-verified; `verify-fractanet-ssh-mesh.ps1`; fracta reboot test passed |
| 2026-07-04 | `rpi3-view` enrolled; 3-node SSH mesh verified; exact addresses kept in private registry |
| 2026-07-04 | Linux node roles: Paoli edge-kiosk, fractanet-linux-layout.sh, registry restructured |
| 2026-07-05 | Android enrolled (`poco-x6-5g` → `poco-jhr`, 100.97.223.45) |
| 2026-07-05 | `poco-jhr` Termux SSH: mesh pubkey, `~/.termux/boot/sshd`, `ssh poco-jhr` from workstation |
| 2026-07-05 | `poco-jhr` Termux bootstrap: layout + outbound mesh SSH; scripts `fractanet-termux-*.sh`, `bootstrap-poco-jhr.ps1` |
| 2026-07-05 | Bootstrap auth key `kMDGHHezga11CNTRL` revoked; 4-node enrollment complete |
| 2026-07-05 | Node capability matrix; WAN topology (`poco-jhr` as mobile WAN hub) |
| 2026-07-05 | `poco-jhr` corpus mirror ~3.1 G (17 repos); sync script `fractanet-sync-repos-from-fracta.sh` |
| 2026-07-05 | `poco-jhr` mobile dev: Grok native, Codex + Claude in Ubuntu proot; `bootstrap-poco-jhr-dev.ps1` |
