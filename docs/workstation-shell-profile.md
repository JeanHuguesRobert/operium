---
title: "Shell profiles (Fractanet nodes)"
date: "2026-07-29"
document_role: operational
document_kind: method
visibility: public
lifecycle_state: active
---

# Shell profiles (Fractanet nodes)

**Owner:** Operium.  
Interactive login shells only — not systemd, not Agent Gateway, not ONA services.

## Model (two layers, every node class)

| Layer | Where | Content |
|-------|--------|---------|
| **Host thin** | `~/.bashrc` / Windows `$PROFILE` | enter workspace root if useful; **source** Operium profile |
| **Operium profile** | `operium/profiles/shell/*` (git) | registry, roots, helpers |

## Profiles

| Node class | Profile | Install |
|------------|---------|---------|
| **workstation-windows** | [`shell/workstation-windows.profile.ps1`](../profiles/shell/workstation-windows.profile.ps1) | User `$PROFILE` dotsources after `cd C:\tweesic` |
| **fracta-vps** | [`shell/fracta-vps.profile.sh`](../profiles/shell/fracta-vps.profile.sh) | [`install-fracta-vps-shell-profile.sh`](../profiles/shell/install-fracta-vps-shell-profile.sh) on ubuntu |
| **termux-android** (draft) | [`shell/termux-android.profile.sh`](../profiles/shell/termux-android.profile.sh) | TBD — first Cogentia twin / **Agent JHN** phone instance |

## Registry

| Context | `COGENTIA_REGISTRY` |
|---------|---------------------|
| Windows workstation | `C:\tweesic\JeanHuguesRobert` |
| Fracta VPS | `/srv/cogentia/repos/JeanHuguesRobert` |
| Phone / twin | instance-local or pulled JHR checkout (set in secrets) |

**Do not** put an incomplete `.cogentia.json` at a parent path that shadows the full registry.

## Fracta install / refresh

On a trusted workstation (after `operium` is pulled on fracta):

```bash
ssh fracta 'cd /srv/cogentia/repos/operium && git pull --ff-only && bash profiles/shell/install-fracta-vps-shell-profile.sh'
```

Verify (login shell):

```bash
ssh fracta 'bash -lc "echo REG=\$COGENTIA_REGISTRY; type cogentia; type operium; pwd"'
```

Expect `REG=/srv/cogentia/repos/JeanHuguesRobert` (or equivalent) and functions defined.

## Windows install (summary)

See also [coding-infrastructure.md](coding-infrastructure.md).

1. User `Documents\PowerShell\profile.ps1` → `cd C:\tweesic` + `. operium\profiles\shell\workstation-windows.profile.ps1`
2. Host profile keeps PATH / conda only

## Phone / Agent JHN (roadmap)

First deployed Cogentia Digital Twin instances (incl. **Agent JHN** / Agent John) are expected on **phone-class** nodes (Termux). Shell entry should:

- load twin-local roots under `$HOME/fractanet` (or instance path);
- set `COGENTIA_REGISTRY` from instance secrets;
- not embed secret values in the profile file;
- stay thin so ONA/heartbeat processes stay independent of interactive login.

Wire `install-termux-shell-profile.sh` when the first instance bootstrap lands; until then the termux profile is a **scaffold** only.

## Related

- [workstation-tooling-debt-and-profiles.md](workstation-tooling-debt-and-profiles.md)
- [fracta-trust-perimeter.md](fracta-trust-perimeter.md)
- Tool profiles: `profiles/tools.*.yaml`
