---
title: "Fracta coding workspace bootstrap"
description: "Reproducible Git and secret bootstrap for continuing C:\\tweesic work on the Fracta VPS."
document_role: operational
document_kind: runbook
visibility: private
status: under-review
update_policy: UP-DEFAULT-REVIEWED
---

# Fracta coding workspace bootstrap

This runbook turns Fracta into a resumable coding node without modifying its
production checkouts.

## Boundaries

- Production checkouts remain under `/srv/cogentia/repos`.
- Interactive coding checkouts live under `/home/ubuntu/tweesic`.
- GitHub branches carry source and WIP state; Git never carries secret values.
- `C:\tweesic\inseme\.env` remains the operator authority until authority is
  deliberately transferred.
- Its Fracta mirror is `/home/ubuntu/tweesic/inseme/.env`, owned by `ubuntu`,
  mode `0600`.
- A disaster-recovery copy is stored at
  `/srv/cogentia/secrets/workstation/inseme.env`, owned by `root`, mode `0600`.
- Other repositories do not receive the full file. Operium derives allowlisted
  runtime views.

## Bootstrap the checkouts

From an existing Operium checkout on Fracta:

```bash
cd ~/tweesic/operium
scripts/ops/fracta-coding-workspace-bootstrap.sh --dry-run
scripts/ops/fracta-coding-workspace-bootstrap.sh
```

The manifest is `profiles/workspace.fracta-coding.v1.tsv`. Backup branches are
selected for repositories saved on 2026-07-28; stable branches are selected for
the remaining corpus repositories. Existing dirty worktrees are refused.

## Publish the authority file

From the trusted Windows workstation:

```powershell
cd C:\tweesic\operium
.\scripts\ops\publish-inseme-env-to-fracta.ps1 -WhatIf
.\scripts\ops\publish-inseme-env-to-fracta.ps1
```

The command uses `scp`, installs both copies atomically with restrictive modes,
then calls `fracta-secret-propagate.sh`. Output contains only paths, modes,
owners, hashes and key counts—never values.

## Derived secret views

`fracta-secret-propagate.sh` creates:

| Target | Scope | Mode |
|---|---|---:|
| `~/tweesic/inseme/.env` | Full Inseme/workstation authority mirror | `0600 ubuntu` |
| `~/.config/cogentia/secrets/coding.env` | Allowlisted coding-provider and system keys | `0600 ubuntu` |
| `/etc/cogentia/magistral.env` | Allowlisted Magistral runtime keys | `0640 root:ubuntu` |
| `/srv/cogentia/secrets/workstation/inseme.env` | Full root-only recovery copy | `0600 root` |

Consumers should load the smallest applicable view. Do not symlink the complete
Inseme authority into Cogentia, Operium, or other repositories.

After refreshing `/etc/cogentia/magistral.env`:

```bash
sudo systemctl restart magistral
systemctl is-active magistral
```

## Verification

```bash
find ~/tweesic -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort
stat -c '%a %U:%G %n' ~/tweesic/inseme/.env
stat -c '%a %U:%G %n' ~/.config/cogentia/secrets/coding.env
sudo stat -c '%a %U:%G %n' /srv/cogentia/secrets/workstation/inseme.env
sudo stat -c '%a %U:%G %n' /etc/cogentia/magistral.env
```

Compare hashes without printing contents:

```bash
sha256sum ~/tweesic/inseme/.env
sudo sha256sum /srv/cogentia/secrets/workstation/inseme.env
```

## Resume from another coding agent

1. Read this runbook and `docs/operium-wip.md`.
2. Inspect `git status --short` in the intended repository.
3. Run `git fetch origin --prune`.
4. Continue the checked-out Backup/WIP branch or use
   `operium resume wip --topic <topic>`.
5. Never copy `/srv/cogentia/repos` changes into the coding workspace without
   first classifying and committing them.

## Android next phase

The Android/Termux node will reuse the workspace manifest and Git handoff model,
but it must receive its own restricted secret projection. Do not copy the full
Inseme authority to the phone by default. The phone phase begins only after
Fracta bootstrap, secret propagation, Git authentication and a complete
round-trip WIP test are verified.
