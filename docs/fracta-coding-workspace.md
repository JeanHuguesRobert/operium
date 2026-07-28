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

This runbook turns the living Fracta checkouts into a resumable coding node.
It follows Optimistic Mainline Governance: read the current state, make a small
versioned act, inspect the differential, and correct by commit when needed.

## Boundaries

- The existing checkouts under `/srv/cogentia/repos` are the working checkouts.
- The bootstrap clones missing repositories and fetches remote state. It does
  not impose a branch or rewrite a dirty worktree.
- GitHub branches carry source and WIP state; Git never carries secret values.
- `C:\tweesic\inseme\.env` remains the operator authority until authority is
  deliberately transferred.
- Its Fracta mirror is `/srv/cogentia/repos/inseme/.env`, owned by `ubuntu`,
  mode `0600`.
- Consumers refer to that one file through explicit symlinks. There are no
  derived copies to drift and no second local authority.
- Native coding-agent identities remain native opaque files:
  `~/.codex/auth.json` and `~/.claude/.credentials.json`, both mode `0600`.

## Bootstrap the checkouts

From the existing Operium checkout on Fracta:

```bash
cd /srv/cogentia/repos/operium
scripts/ops/fracta-coding-workspace-bootstrap.sh --dry-run
scripts/ops/fracta-coding-workspace-bootstrap.sh
```

The manifest is `profiles/workspace.fracta-coding.v1.tsv`. Its branch column is
a resume hint. The bootstrap fetches it but leaves the current branch and local
changes visible for the next agent to inspect.

## Publish the authority file

From the trusted Windows workstation:

```powershell
cd C:\tweesic\operium
.\scripts\ops\publish-inseme-env-to-fracta.ps1 -WhatIf
.\scripts\ops\publish-inseme-env-to-fracta.ps1
```

The command uses `scp`, installs both copies atomically with restrictive modes,
then calls `fracta-secret-propagate.sh`. Output contains only paths, modes,
owners and hashes—never values.

## Derived secret views

`fracta-secret-propagate.sh` creates:

| Target | Scope | Mode |
|---|---|---:|
| `/srv/cogentia/repos/inseme/.env` | Fracta authority mirror | `0600 ubuntu` |
| `cogentia/.env` | Link to `../inseme/.env` | symlink |
| `operium/.env` | Link to `../inseme/.env` | symlink |
| `survey/.env` | Link to `../inseme/.env` | symlink |
| `ubikia/.env` | Link to `../inseme/.env` | symlink |
| `magistral.service.d/inseme-authority.conf` | Adds the same authority as a systemd `EnvironmentFile` | public config, secret remains `0600` |

After refreshing the authority:

```bash
sudo systemctl restart magistral
systemctl is-active magistral
```

## Verification

```bash
find ~/tweesic -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort
stat -c '%a %U:%G %n' /srv/cogentia/repos/inseme/.env
readlink /srv/cogentia/repos/cogentia/.env
readlink /srv/cogentia/repos/operium/.env
systemctl cat magistral | grep -F 'EnvironmentFile=/srv/cogentia/repos/inseme/.env'
```

Compare hashes without printing contents:

```bash
sha256sum /srv/cogentia/repos/inseme/.env
```

## Coding agents and GitHub

The initial live bootstrap on 2026-07-28 established:

```text
Codex 0.144.5       authenticated with ChatGPT
Claude Code 2.1.220 authenticated with claude.ai Pro
Grok Build 0.2.112  authenticated with its existing Fracta OIDC identity
GitHub CLI          authenticated as JeanHuguesRobert
```

Codex already existed as a standalone user install under `~/.codex`. Claude
Code is installed under `~/.local`; `.profile` adds `~/.local/bin` to `PATH`.
Grok Build is installed from the official `https://x.ai/cli/install.sh` under
`~/.grok/bin`; `.profile` adds that directory to `PATH`. `grok doctor` and
`grok models` were used as non-generative runtime/authentication checks. Fracta
already held a valid OIDC identity, so the workstation identity was not copied
over it.

The `GITHUB_TOKEN` value found in the transferred `.env` returned HTTP 401.
GitHub CLI was therefore authenticated from the workstation's valid native
credential store. Refresh the `.env` entry when convenient; it does not block
Git work on Fracta.

## Resume from another coding agent

1. Read this runbook and `docs/operium-wip.md`.
2. Inspect `git status --short` in the intended repository.
3. Run `git fetch origin --prune`.
4. Continue the current living branch, switch to the fetched Backup/WIP branch,
   or use
   `operium resume wip --topic <topic>`.
5. Never copy `/srv/cogentia/repos` changes into the coding workspace without
   first classifying and committing them.

## Android next phase

The Android/Termux node will reuse the workspace manifest and Git handoff model,
but it must receive its own restricted secret projection. Do not copy the full
Inseme authority to the phone by default. The phone phase begins only after
Fracta bootstrap, secret propagation, Git authentication and a complete
round-trip WIP test are verified.
