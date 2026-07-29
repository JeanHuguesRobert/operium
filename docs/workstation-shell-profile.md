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
| **termux-android** | [`shell/termux-android.profile.sh`](../profiles/shell/termux-android.profile.sh) | [`install-termux-shell-profile.sh`](../profiles/shell/install-termux-shell-profile.sh) on `poco-jhr` (Agent JHN / twin class) |

## Registry

| Context | `COGENTIA_REGISTRY` |
|---------|---------------------|
| Windows workstation | `C:\tweesic\JeanHuguesRobert` |
| Fracta VPS | `/srv/cogentia/repos/JeanHuguesRobert` |
| Phone / twin (`poco-jhr`) | `$HOME/srv/cogentia/repos/JeanHuguesRobert` (override via `~/srv/cogentia/secrets/shell-profile.env`) |

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

## Phone / Termux / Agent JHN

First Cogentia Digital Twin instances (incl. **Agent JHN** / Agent John) use the same **termux-android** node class as `poco-jhr`.

Observed layout on `poco-jhr` (do not invent `$HOME/fractanet` unless a twin deliberately uses it):

| Path | Role |
|------|------|
| `~/srv/cogentia/repos` | corpus / coding workspace (`CORPUS_REPOS`) |
| `~/srv/cogentia/secrets` | env files (gateway, ONA, optional `shell-profile.env`) |
| `~/srv/cogentia/work` | scratch / work |

Install / refresh (from workstation, mesh SSH):

```bash
ssh poco-jhr 'cd $HOME/srv/cogentia/repos/operium && git fetch origin main && git checkout origin/main -- profiles/shell/termux-android.profile.sh profiles/shell/install-termux-shell-profile.sh && bash profiles/shell/install-termux-shell-profile.sh'
```

Verify (interactive shell loads `.bashrc` via `.profile` on Termux login):

```bash
ssh -t poco-jhr 'bash -ic "echo REG=\$COGENTIA_REGISTRY; type cogentia; type operium; type tweesic; pwd"'
```

Expect `REG=.../JeanHuguesRobert` and the three functions defined.

**Host thin layer** keeps existing Termux PATH / proot aliases / agent-gateway env; the Operium block only sources the managed profile. Do not put secret values in the profile file — use `secrets/*.env` or optional `secrets/shell-profile.env` for path overrides only.

## Related

- [workstation-tooling-debt-and-profiles.md](workstation-tooling-debt-and-profiles.md)
- [fracta-trust-perimeter.md](fracta-trust-perimeter.md)
- Tool profiles: `profiles/tools.*.yaml`
