# Operium Node Agent — fleet install

Production rollout for **ONA** (`:8794`) on fracta and capable nodes. Catalogue stanzas live in `registre-mariani/operium/registry/resources.yaml` under `operium_node_agent`.

**Primary fleet UI:** [Operium Console](operium-console.md) at `/ops/console/` on fracta. The static [`fractanet-dashboard.html`](../../cogentia/scripts/ops/fractanet-dashboard.html) remains as a fallback JSON viewer.

**Control-room MIB-lite (planned):** global + zoom UI contract —
[control-room-mib-lite-v0.md](control-room-mib-lite-v0.md) (ONA/SOMA as agent plane; step 1 desk display is [rpi3-view-edge-portal.md](rpi3-view-edge-portal.md)).

---

## Port and plane

| Service | Port | Plane |
|---------|------|-------|
| agent-gateway | 8793 | Action |
| **ONA** | **8794** | Control |
| cogentia MCP (fracta) | 8791 | Aggregator |

ONA also serves the SOMA read plane:

| Endpoint | Access | Role |
|----------|--------|------|
| `GET /.well-known/soma` | public when `ONA_HEALTH_PUBLIC=1` | Safe node descriptor and discovery |
| `GET /soma/vocabulary` | public when `ONA_HEALTH_PUBLIC=1` | Classes, facets, and attribute semantics |
| `GET /soma/object` | read token | Managed node and contained service objects |
| `GET /soma/observations` | read token | Current sampleable observations |

SOMA v0 is read-only. Write actions are deliberately deferred.

The first public node publishes safe discovery at:

```text
https://fracta.fractavolta.com/.well-known/soma
https://fracta.fractavolta.com/soma/vocabulary
```

The public Caddy route forwards `/soma/*` so descriptor-relative resource URLs
remain correct. ONA itself enforces the boundary: `/soma/object` and
`/soma/observations` return `401` without a valid read token.

### SOMA v0 fleet rollout — 2026-07-28

| Node | Runtime | Persistence | Verified identity |
|------|---------|-------------|-------------------|
| `fracta` | Git checkout `dd724db` | systemd | `resource://fracta` |
| `i7-thinkpad-jhr` | Git checkout `dd724db` | NSSM Windows service | `resource://i7-thinkpad-jhr` |
| `rpi3-view` | immutable 3 MB runtime artifact, no Git checkout | systemd | `resource://rpi3-view` |
| `poco-jhr` | `runtime/soma-fractanet` tracking the published checkpoint | Termux:Boot hook | `resource://poco-jhr` |

All four nodes passed `soma.descriptor.v0` discovery. Detailed object access
returned `401` without a read token on every tested node.

The Pi runs Node `22.23.1` from the Node.js unofficial ARM build because
`22.12.0` did not expose `node:sqlite`. The downloaded archive was verified
against its published SHA-256 checksum before activation. The former binary is
retained as `~/.local/bin/node-v22.12.0`.

---

## Secrets layout

Never commit token values. Reference only in catalogue (`secret://ona-*`).

### Per-node ONA daemon (`ona.env`)

| Variable | Required | Role |
|----------|----------|------|
| `ONA_ENABLED` | yes | `1` to run; `0` for rollback (unit installed, process exits) |
| `ONA_READ_TOKEN` | yes | CLI + read API |
| `ONA_ADMIN_TOKEN` | yes | `POST /node/probe`, admin routes |
| `ONA_PEER_TOKEN` | yes when `ONA_COP_DELIVERY=1` | Inter-node COP |
| `ONA_LOCATION` | optional | SNMP **sysLocation** spirit → SOMA `core.location` (alias `ONA_SYS_LOCATION`) |
| `ONA_CONTACT` | optional | SNMP **sysContact** spirit → SOMA `core.contact` (alias `ONA_SYS_CONTACT`) |

### Heartbeat env (`ona-heartbeat.env` or shared blackboard env)

| Variable | Role |
|----------|------|
| `COGENTIA_BLACKBOARD_URL` | e.g. `https://cogentia.fractavolta.com/ops/blackboard` |
| `COGENTIA_BLACKBOARD_UPSERT_TOKEN` | Bearer for `POST /ops/blackboard/upsert` |
| `ONA_ATTRACTOR_TAILSCALE_IP` | Optional — publishes `http://<ip>:8794` |

### Fracta aggregator (MCP `8791`) — console proxy

| Variable | Role |
|----------|------|
| `COGENTIA_OPS_READ_TOKEN` | Browser/console → `GET /ops/node/{id}/status\|drift` |
| `ONA_READ_TOKEN` | fracta → peer ONA `:8794` (server-held; not in browser bundle) |

See [operium-console.md](operium-console.md#fracta-server-env-aggregator).

### Fracta aggregator secret file

Store the two aggregator tokens outside the systemd drop-in:

```bash
sudo install -d -o root -g ubuntu -m 0750 /srv/cogentia/secrets
sudo install -o root -g ubuntu -m 0640 /dev/null /srv/cogentia/secrets/ona-proxy.env
sudoedit /srv/cogentia/secrets/ona-proxy.env
```

The file contains the runtime assignments for `COGENTIA_OPS_READ_TOKEN` and
`ONA_READ_TOKEN`. Do not print it, copy it into a repository, or paste it into a
terminal transcript.

The systemd override contains only:

```ini
[Service]
EnvironmentFile=/srv/cogentia/secrets/ona-proxy.env
```

Verify metadata and presence without returning values:

```bash
stat -c '%n owner=%U group=%G mode=%a' /srv/cogentia/secrets/ona-proxy.env
grep -q '^COGENTIA_OPS_READ_TOKEN=' /srv/cogentia/secrets/ona-proxy.env && echo ingress-configured
grep -q '^ONA_READ_TOKEN=' /srv/cogentia/secrets/ona-proxy.env && echo peer-read-configured
systemctl show mcp-cogentia.service --property=EnvironmentFiles --property=DropInPaths
```

Never diagnose this configuration with unredacted `systemctl cat`, `env`,
`printenv`, or a printed env file. See [Fracta trust perimeter and secrets](fracta-trust-perimeter.md#secret-safe-inspection-protocol).

---

## fracta (Ubuntu VPS) — systemd

Script: `cogentia/scripts/ops/install-ona-systemd.sh`

```bash
# On fracta — after operium + registre-mariani are under /srv/cogentia/repos/
sudo tee /srv/cogentia/secrets/ona.env <<'EOF'
ONA_ENABLED=1
ONA_READ_TOKEN=<generate>
ONA_ADMIN_TOKEN=<generate>
ONA_PEER_TOKEN=<generate>
EOF
sudo chmod 600 /srv/cogentia/secrets/ona.env

# Heartbeat — reuse blackboard upsert token from guide.env
sudo cp /srv/cogentia/secrets/guide.env /srv/cogentia/secrets/ona-heartbeat.env
# Edit: ensure COGENTIA_BLACKBOARD_URL and COGENTIA_BLACKBOARD_UPSERT_TOKEN

cd /srv/cogentia/repos/cogentia
sudo OPERIUM_ROOT=/srv/cogentia/repos/operium bash scripts/ops/install-ona-systemd.sh
```

Verify:

```bash
curl -fsS http://127.0.0.1:8794/health
curl -fsS http://127.0.0.1:8791/ops/blackboard?capability=operium.node.v1
operium node status --json   # from operator workstation with ONA_READ_TOKEN
```

Units installed:

| Unit | Role |
|------|------|
| `operium-node-agent.service` | ONA daemon |
| `ona-heartbeat.timer` | Blackboard advertise every 3 min |

Logs: `/var/lib/cogentia/logs/operium-node-agent.log`

---

## i7-thinkpad-jhr (Windows 11) — Windows Service (NSSM)

Mirrors fracta `operium-node-agent.service` — **node.exe via NSSM**, no PowerShell at runtime.

**Why not PowerShell for the daemon?** On this host, `pwsh` with profile loads miniconda (`Documents\PowerShell\profile.ps1`) and adds ~30s per invocation; `pwsh -NoProfile` is ~3s vs **node ~2s**. The service therefore runs `node bin/operium-node-agent.js` directly; env vars come from `ona.env` via NSSM `AppEnvironmentExtra`.

1. **Secrets** — `C:\Users\admin\.cogentia\secrets\ona.env` and `ona-blackboard.env` (see catalogue `operium_node_agent` stanza). Ensure `COGENTIA_OPS_STATE_DIR` is set in `ona.env` (required when service runs as LocalSystem).

2. **ONA daemon** — install Windows Service (elevated pwsh):

```powershell
pwsh -NoProfile -File C:\tweesic\operium\scripts\ops\install-ona-windows-service.ps1
```

Installs `OperiumNodeAgent` via NSSM: auto-start, restart on exit, log rotation. Removes legacy `OperiumNodeAgent` logon task if present.

Verify:

```powershell
Get-Service OperiumNodeAgent
curl http://127.0.0.1:8794/health
```

Rollback: `pwsh -File install-ona-windows-service.ps1 -Remove`

3. **Heartbeat** — `operium/scripts/ops/install-ona-heartbeat-windows.ps1` (install once in pwsh; task runs `cmd.exe` + `node`, like `ona-heartbeat.timer`):

```powershell
pwsh -NoProfile -File C:\tweesic\operium\scripts\ops\install-ona-heartbeat-windows.ps1 `
  -HeartbeatEnvFile C:\Users\admin\.cogentia\secrets\ona-blackboard.env
```

Task: `CogentiaOperiumNodeHeartbeat` (every 3 min + at logon). Launcher: `%USERPROFILE%\.cogentia\secrets\run-ona-heartbeat-<hostname>.cmd`.

---

## poco-jhr (Termux)

The node uses:

- `~/srv/cogentia/secrets/ona.env`
- a Termux:Boot hook that starts `scripts/ops/run-ona-supervised.js`
- `operium/scripts/ona-heartbeat.js` via the boot hook
- Bind `0.0.0.0:8794` with bearer tokens (no tailscale CLI on device)

The Node supervisor is intentionally small. Exit code `75` means that a SOMA
`agent.restart` action requested a new process incarnation. Other non-zero
exits are also retried with a bounded delay; a clean exit stops the loop.

```bash
exec node ~/srv/cogentia/repos/operium/scripts/ops/run-ona-supervised.js
```

---

## Rollback

1. Set `ONA_ENABLED=0` in `ona.env` and restart the daemon unit/task.
2. Withdraw blackboard attractor:

```bash
COGENTIA_ATTRACTOR_WITHDRAW=1 node operium/scripts/ona-heartbeat.js
```

3. Stop units:
   - Linux: `sudo systemctl stop operium-node-agent.service ona-heartbeat.timer`
   - Windows: disable `OperiumNodeAgent` and `CogentiaOperiumNodeHeartbeat` tasks
4. Optional: delete `node_memory.sqlite` under `COGENTIA_OPS_STATE_DIR` (cache only; no catalogue impact).

---

## Post-install checklist

| Step | Command / check |
|------|-----------------|
| Local health | `GET http://127.0.0.1:8794/health` |
| Blackboard | fresh `operium.node.v1` on `/ops/blackboard?capability=operium.node.v1` |
| Aggregator layer | `GET /ops/status` → `layers.node_agents.fresh_count >= 1` |
| Console fleet | open `/ops/console/` — node cards from blackboard |
| Console node detail | `COGENTIA_OPS_READ_TOKEN` set on fracta MCP |
| Diagnose | `operium node diagnose --human` on capable host |

## SOMA action rollout evidence — 2026-07-28

Release `92a45f2` was activated and the two initial administrative actions
were exercised locally on every current FractaNode:

| Node | Supervisor | Schema | `observation.refresh` | `agent.restart` |
|---|---|---:|---|---|
| `fracta` | systemd | 3 | completed | completed by a new incarnation |
| `i7-thinkpad-jhr` | NSSM | 3 | completed | completed by a new incarnation |
| `rpi3-view` | systemd, immutable release `92a45f2-git` | 3 | completed | completed by a new incarnation |
| `poco-jhr` | Termux Node supervisor | 3 | completed | completed by a new incarnation |

Operational notes:

- The Pi's `~/srv/cogentia/repos/operium` path was a minimal source copy, not
  a Git worktree. Its immutable release was therefore built from the verified
  Git archive supplied by the workstation.
- The Pi `ona.env` contained three CRLF lines. They were normalized to LF
  without changing values because carriage returns cannot be transported in
  HTTP header values.
- The Termux boot hook now executes `run-ona-supervised.js`; the pre-change
  hook remains available as `operium-node-agent.pre-soma-actions`.
- Windows service activation required a local UAC elevation because the NSSM
  service runs as `LocalSystem`.
- Refresh results still report low health scores on several nodes. These are
  existing probe results and require diagnosis independently of the action
  transport, persistence, and restart lifecycle validated here.

---

## References

| Doc | Path |
|-----|------|
| Design | [operium-node-agent.md](operium-node-agent.md) |
| Console | [operium-console.md](operium-console.md) |
| Catalogue | `registre-mariani/operium/registry/resources.yaml` |
| systemd install | `cogentia/scripts/ops/install-ona-systemd.sh` |
| Windows service | `operium/scripts/ops/install-ona-windows-service.ps1` |
| Windows heartbeat | `operium/scripts/ops/install-ona-heartbeat-windows.ps1` |
