# Operium Node Agent — fleet install

Production rollout for **ONA** (`:8794`) on fracta and capable nodes. Catalogue stanzas live in `registre-mariani/operium/registry/resources.yaml` under `operium_node_agent`.

**Primary fleet UI:** [Operium Console](operium-console.md) at `/ops/console/` on fracta. The static [`fractanet-dashboard.html`](../../cogentia/scripts/ops/fractanet-dashboard.html) remains as a fallback JSON viewer.

---

## Port and plane

| Service | Port | Plane |
|---------|------|-------|
| agent-gateway | 8793 | Action |
| **ONA** | **8794** | Control |
| cogentia MCP (fracta) | 8791 | Aggregator |

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

## poco-jhr (Termux) — planned

After agent-gateway bootstrap:

- `~/srv/cogentia/secrets/ona.env`
- `operium/scripts/ona-heartbeat.js` via Termux boot script (mirror `agent-gateway-heartbeat`)
- Bind `0.0.0.0:8794` with bearer tokens (no tailscale CLI on device)

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