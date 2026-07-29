---
title: "Workstation shell profile (PowerShell)"
date: "2026-07-29"
document_role: operational
document_kind: method
visibility: public
lifecycle_state: active
---

# Workstation shell profile (PowerShell)

**Owner:** Operium (desired shell entry for the Windows corpus workstation).  
**App / OS:** thin user `$PROFILE` + Operium-managed workspace profile.

## Model (two layers)

| Layer | Path | Content |
|-------|------|---------|
| **User (thin)** | `$PROFILE` / `Documents\PowerShell\…` | `cd C:\tweesic` when needed; dot-source Operium profile; host PATH / conda |
| **Workspace (Operium)** | [`profiles/shell/workstation-windows.profile.ps1`](../profiles/shell/workstation-windows.profile.ps1) | `COGENTIA_REGISTRY`, roots, helpers `tweesic` / `operium` / `cogentia` |

Interactive only. **Do not** rely on this for scheduled tasks (Agent Gateway uses `-NoProfile`).

## Registry

Single corpus registry authority:

```text
C:\tweesic\JeanHuguesRobert\.cogentia.json
```

Set as directory or file via `COGENTIA_REGISTRY` (cogentia accepts both).  
**Do not** reintroduce an incomplete `C:\tweesic\.cogentia.json` (shadows the full registry when walking up from sibling repos).

## Install / update (this machine)

1. Ensure Operium profile exists (this repo path).
2. User profiles (written by ops; re-apply after machine rebuild):

**`Documents\PowerShell\profile.ps1`** (CurrentUserAllHosts) — conda lazy-load + workspace entry.  
**`Documents\PowerShell\Microsoft.PowerShell_profile.ps1`** (CurrentUserCurrentHost) — PATH / tools for interactive host.

3. Open a new `pwsh` window. Expect:
   - cwd under `C:\tweesic` (or already there)
   - message: `Operium workspace profile loaded (COGENTIA_REGISTRY=…)`
   - prompt prefix `[tweesic|reg]` when inside the workspace

## Verify

```powershell
$env:COGENTIA_REGISTRY
$env:TWEESIC_ROOT
Get-Command tweesic, operium, cogentia
tweesic operium   # cd C:\tweesic\operium
```

## Related

- [workstation-tooling-debt-and-profiles.md](workstation-tooling-debt-and-profiles.md)
- [coding-infrastructure.md](coding-infrastructure.md)
- [cogentia-semantic-stack.md](cogentia-semantic-stack.md) — registry env examples
