---
title: "Incident note — inox-serve offline on ThinkPad (July 2026)"
description: "Why local inox-serve :8792 was down while blackboard still showed a fresh attractor."
layout: default
date: 2026-07-04
last_modified_at: 2026-07-04
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/research/inox-serve-thinkpad-2026-07.md
document_role: "operational"
document_kind: "incident"
visibility: "public"
lifecycle_state: "active"
status: "mitigated — task manually started; install script hardened"
---

# Incident note — inox-serve offline on ThinkPad (July 2026)

## Symptoms

| Symptom | Observer |
|---------|----------|
| `Local inox FAIL` at `http://127.0.0.1:8792/health` | `operium up --human` |
| Port 8792 not listening | `Get-NetTCPConnection` |
| Blackboard still showed **fresh attractor** | fracta `/ops/blackboard` |
| fracta → laptop inox failed | Tailscale curl |

Guide on fracta was configured for `inox-session` over the ThinkPad Tailscale address, but the fulfiller was down.

## Root cause (observed)

Scheduled task **`InoxServeCapableHost`**:

| Field | Value |
|-------|-------|
| Trigger | **At logon only** (`I7-THINKPAD-JHR\admin`) |
| Last run (before fix) | **Never** (`1999-11-30`, result `267011` = task has not run) |
| Idle settings | `StopOnIdleEnd: true` (can stop long-running workloads) |
| State | `Ready` (not running) |

The task was registered **after** an active logon session, so the logon trigger **never fired**. The install script's `Start-Process` launch either did not persist or the process exited later. The **heartbeat task** (`CogentiaAttractorHeartbeat`) runs every 3 min independently and kept advertising the attractor **without verifying inox-serve**.

## Remediation (2026-07-04)

```powershell
schtasks /Run /TN InoxServeCapableHost
```

Result: port `0.0.0.0:8792` listening, `/health` OK, fracta reachability OK over Tailscale.

## Hardening

Update `Inox/scripts/ops/install-inox-serve-windows.ps1`:

- `DontStopOnIdleEnd` on task settings
- **AtStartup** trigger in addition to AtLogOn (where permitted)
- Explicit `schtasks /Run` after registration
- Document: re-run install script after task changes

## Operator checks

```powershell
Get-ScheduledTask InoxServeCapableHost | Get-ScheduledTaskInfo
Get-NetTCPConnection -LocalPort 8792
Invoke-RestMethod http://127.0.0.1:8792/health
```

```bash
ssh fracta 'curl -fsS http://<thinkpad-tailscale-ip>:8792/health | jq .ok'
operium up --human
```

## Intended follow-up

- Heartbeat should probe local inox `/health` before upsert (or mark attractor `degraded`).
- Consider Windows Service or always-on trigger vs hidden pwsh child.

## Changelog

| Date | Change |
|------|--------|
| 2026-07-04 | Investigation; manual task run; incident note |
