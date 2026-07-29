---
title: "Agent CLI Gateway — Windows lifetime (logon task)"
date: "2026-07-29"
document_role: operational
document_kind: method
visibility: public
lifecycle_state: active
---

# Agent CLI Gateway — Windows lifetime (logon task)

**Owner:** Operium (procedure, apply, FBF).  
**App code / installers:** Cogentia `scripts/ops/*`.  
**Host:** ThinkPad tool host (`i7-thinkpad-jhr`), action plane only.  
**Linux analog:** systemd `Type=simple` unit that keeps the process in the foreground.

## Model

| Role | Mechanism |
|------|-----------|
| Process parent | Windows Task Scheduler task **`CogentiaAgentGateway`** |
| Trigger | At user logon (interactive) |
| Action | `pwsh -File ~\.cogentia\secrets\boot-agent-gateway-<host>.ps1` |
| Boot shim | Calls `cogentia/scripts/ops/run-agent-gateway-windows-foreground.ps1` |
| Runtime | `node scripts/agent-gateway.js` — **blocks** until exit |
| Settings | Unlimited execution time, restart ×3 / 1 min, no battery kill |
| Secrets | `~\.cogentia\secrets\agent-gateway.env` (`COGENTIA_API_KEY` only; FS authority `inseme/.env`) |

Do **not** rely on:

- Agent/IDE shell background jobs (session / max-runtime kills them)
- Fire-and-forget `start-agent-gateway-windows.js` as the only durability path (detached start is best-effort)

One-shot start helper remains useful for manual restarts and watchdog; **lifetime owner is the logon task.**

## Apply (ThinkPad)

From trusted workstation (this machine when it *is* the tool host):

```powershell
# Re-write env + boot shim + register logon task + start now
pwsh -NoProfile -File C:\tweesic\cogentia\scripts\ops\install-agent-gateway-windows.ps1 `
  -Bind tailscale `
  -RegisterStartupTask `
  -StartTask
```

Operium wrapper (same effect, documented path):

```powershell
pwsh -NoProfile -File C:\tweesic\operium\scripts\ops\apply-agent-gateway-thinkpad-lifetime.ps1
```

Expect:

- Task `\CogentiaAgentGateway` state **Running** (while gateway up) or **Ready** after stop
- `netstat` LISTEN on Tailscale IP `:8793`
- From fracta: `GET /health?quick=1` and `/v1/models` **200** with bearer

## Verify

```powershell
Get-ScheduledTask -TaskName CogentiaAgentGateway | Format-List State
Get-ScheduledTaskInfo -TaskName CogentiaAgentGateway | Format-List LastRunTime,LastTaskResult
# ExecutionTimeLimit should be unlimited (00:00:00 / disabled)
schtasks /Query /TN CogentiaAgentGateway /FO LIST /V | Select-String -Pattern 'Arr.ter|Stop|Ex.cut|Status|Task To Run'
netstat -ano | findstr "LISTENING" | findstr "8793"
```

Public / Magistal path (after Magistal + timeouts healthy):

```bash
curl -fsS -m 120 -X POST https://cogentia.fractavolta.com/guide/chat \
  -H 'Content-Type: application/json' \
  -d '{"question":"What is Potentics?","locale":"en"}'
# Expect mode=conversational
```

## Reboot proof (close OP-BUG-001)

1. Reboot ThinkPad, log on as the task user.  
2. Confirm task ran and `:8793` listens without a manual start.  
3. Fracta quick health + optional Guide conversational smoke.  
4. Close OP-BUG-001 with evidence.

## Related

- [magistral-coding-agent-routing.md](magistral-coding-agent-routing.md) — Guide → Magistal → this gateway  
- [secrets-management.md](secrets-management.md) — `COGENTIA_API_KEY` dual authority  
- Cogentia: `scripts/ops/install-agent-gateway-windows.ps1`, `run-agent-gateway-windows-foreground.ps1`  
- Backlog: OP-BUG-001  
