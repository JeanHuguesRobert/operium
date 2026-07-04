---
title: "Fractanet mesh — Tailscale and SSH (July 2026)"
description: "Operational record of the virteal tailnet, bidirectional SSH mesh, capable-host wiring, and Packet Attractor Phase 1 on fracta."
layout: default
date: 2026-07-04
last_modified_at: 2026-07-04
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/fractanet-mesh.md
document_role: "operational"
document_kind: "method"
visibility: "public"
lifecycle_state: "active"
status: "mesh live (2 nodes); Pi pending"
---

# Fractanet mesh — Tailscale and SSH (July 2026)

This note records **observed operational state** after resuming [Fractanet resumption handoff](../research/fractanet-resumption-2026-07.md) in July 2026. It belongs in **Operium** (infrastructure memory).

Companion notes:

- [Fracta trust perimeter and secrets](fracta-trust-perimeter.md) — `guide.env`, Phase 4 retrieval
- [Fractanet resumption handoff](../research/fractanet-resumption-2026-07.md) — north star and open decisions
- [Public / private split](public-private-split.md) — secret references, not values
- Cogentia scripts: `cogentia/scripts/ops/` (bootstrap, heartbeat, Windows SSH install)
- Private node catalogue: `~/.cogentia/registry/resources.yaml` (IPs, secret paths — **not in git**)

---

## Purpose

Fractanet nodes must reach each other **without a single fixed URL** and **without exposing SSH on the public Internet** for routine ops. The July 2026 bootstrap uses:

1. **Tailscale** (tailnet `virteal`, future org `fractanet`) — private L3 mesh between nodes
2. **OpenSSH** on each node — operator and inter-node access over Tailscale IPs
3. **Shared mesh identity** (`fractanet-mesh` ed25519 key) — one key pair for node-to-node SSH (operator trust model)

This is **bootstrap transport**, not the target Packet Attractor routing layer.

---

## Tailnet inventory (observed 2026-07-04)

| Hostname | OS | Tailnet role | SSH mesh | Other services |
|----------|-----|--------------|----------|----------------|
| `fracta` | Ubuntu VPS (OCI) | always-on public face | inbound + outbound | Cogentia Guide MCP, blackboard aggregator |
| `i7-thinkpad-jhr` | Windows 11 | intermittent capable host | inbound + outbound | `inox-serve` :8792, attractor heartbeat |
| `rpi3-view` | Raspberry Pi OS (Pi 3) | **planned** | not yet joined | — |

Tailscale IPs and LAN addresses live in the **private** registry only. MagicDNS short names (`ssh fracta`, `ssh rpi3-view`) work when enabled in the tailnet admin console.

**Health:** both live nodes report connected on tailnet `virteal.org.github`. fracta reaches the laptop `inox-serve` health endpoint over Tailscale (verified after Windows firewall rules for TCP 8792 and 22).

---

## SSH mesh architecture

```text
                    virteal tailnet (100.x.x.x)
    +---------------------------+---------------------------+
    |                           |                           |
 i7-thinkpad-jhr              fracta                  rpi3-view
 (admin, Windows)            (ubuntu, Linux)          (pi, Pi OS)
 sshd :22                    sshd :22                 [pending]
 inox-serve :8792             Guide :8791
    |                           |
    +-------- fractanet-mesh key pair (ed25519) ----------+
              (private key on each node; pubkey in authorized_keys)
```

### SSH aliases (operator workstation)

Local `~/.ssh/config` on the trusted workstation defines:

| Alias | Target | User | Key |
|-------|--------|------|-----|
| `fracta` / `fracta-ts` | Tailscale IP of fracta | `ubuntu` | `fractanet-mesh` |
| `fracta-public` | OCI public IP (break-glass) | `ubuntu` | `oci-fracta-instance-jh1` |
| `thinkpad-ts` / `i7-thinkpad-jhr` | Tailscale IP of laptop | `admin` | `fractanet-mesh` |
| `rpi3-view` | MagicDNS hostname | `pi` | `fractanet-mesh` |

Routine ops use **Tailscale aliases** (`ssh fracta`). Public IP SSH remains for break-glass and initial bootstrap.

### Mesh key (reference only)

| Item | Location (private, not in git) |
|------|--------------------------------|
| Key id | `fractanet-mesh` (ed25519) |
| Operator copy | `~/.cogentia/secrets/fractanet-mesh` (+ `~/.ssh/fractanet-mesh`) |
| fracta copy | `~/.ssh/fractanet-mesh` (ubuntu) |
| Authorized on Linux nodes | `~/.ssh/authorized_keys` |
| Authorized on Windows admin | `C:\ProgramData\ssh\administrators_authorized_keys` |

**Never** commit the private key or Tailscale auth keys. Rotate `fractanet-mesh` if leaked.

### Verified connectivity (2026-07-04)

| From | To | Command | Result |
|------|-----|---------|--------|
| workstation | fracta | `ssh fracta hostname` | `fracta` |
| workstation | fracta | `ssh fracta-public hostname` | `fracta` |
| fracta | laptop | `ssh admin@<thinkpad-ts-ip> hostname` | `i7-thinkpad-jhr` |
| fracta | laptop | `ssh thinkpad hostname` | `i7-thinkpad-jhr` |
| fracta | laptop inox | `curl http://<thinkpad-ts-ip>:8792/health` | OK |

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
| Tailscale | joined via auth key (expiry observed Oct 2026 — **revoke after Pi join**) |
| Blackboard routes | Caddy + Guide MCP `/ops/blackboard` (Phase 1) |

### New Linux node (Raspberry Pi OS template)

Script: `cogentia/scripts/ops/fractanet-node-bootstrap.sh`

Required env on the Pi:

```bash
NODE_HOSTNAME=rpi3-view          # optional
TAILNET_USER=pi                  # optional
TAILSCALE_AUTH_KEY=tskey-auth-...   # from tailnet admin — value not in git
FRACTANET_MESH_PUBKEY="ssh-ed25519 ..."  # public half only
```

Then copy `fractanet-mesh` private key to `~/.ssh/fractanet-mesh` (`chmod 600`) for outbound SSH.

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
| Tailscale auth key leak | Revoke in admin console; issue per-node keys |
| Laptop offline | Guide degradation / Supabase fallback — triage policy A/B/C |
| Windows admin SSH | Only `administrators_authorized_keys`; not user-level `authorized_keys` for admins |
| `/guide/health` 500 on fracta | Separate issue (daemon timeout on 1 GB VPS); does not block mesh or blackboard |

---

## Intended evolutions (not current state)

- Join `rpi3-view` (Pi 3) to tailnet and SSH mesh
- Rename tailnet org `virteal` → `fractanet`
- Phase 2: blackboard-aware Guide routing
- Revoke reusable Tailscale auth keys after node enrollment
- Option C fallback policy (attractor routing + explicit degradation)

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