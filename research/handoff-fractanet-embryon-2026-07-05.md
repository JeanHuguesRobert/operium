---
title: "Handoff — Fractanet embryon (PC → mobile)"
description: "Session continuity note for resuming Fractanet work on poco-jhr after leaving the ThinkPad."
date: 2026-07-05
status: active
topic: fractanet-embryon
---

# Handoff — Fractanet embryon (2026-07-05)

Portable context for a **new Grok session on `poco-jhr`**. Git state is carried by `operium handoff/resume wip`; this file carries **intent, decisions, and next steps**.

## Session arc (what we did on ThinkPad)

1. Bootstrapped `poco-jhr` (Termux SSH mesh, layout, outbound SSH).
2. Mirrored corpus ~3.1 G (17 repos) on phone; installed Grok/Codex/Claude dev stack.
3. Documented 4-node capability matrix + WAN topology (`poco-jhr` = mobile WAN hub).
4. Moved canonical private catalogue to `registre-mariani/operium/registry/resources.yaml`.
5. Pushed operium docs + WIP CLI on branch `feature/operium-wip-handoff` (now also `wip/fractanet-embryon`).

## Git pins

| Repo | Branch | Note |
|------|--------|------|
| `operium` | `wip/fractanet-embryon` | Resume here on phone |
| `registre-mariani` | `main` | Private catalogue; **not** in fracta corpus mirror — clone separately on phone |

## Resume on `poco-jhr` (Termux)

```bash
export PATH=$HOME/.local/bin:$HOME/.grok/bin:$PATH
cd ~/srv/cogentia/repos/operium
git fetch origin
node bin/operium.js resume wip --topic fractanet-embryon --human
```

If operium on phone is old (no `handoff` subcommand), `git pull` on `main` first or fetch `wip/fractanet-embryon` manually:

```bash
git fetch origin wip/fractanet-embryon
git switch -c wip/fractanet-embryon --track origin/wip/fractanet-embryon
```

Private registry (after cloning `registre-mariani` on phone):

```bash
export OPERIUM_REGISTRY=~/srv/cogentia/repos/registre-mariani/operium/registry/resources.yaml
node bin/operium.js up --human
```

## Prompt for new Grok session on phone

Paste:

```text
Reprise handoff Fractanet embryon (2026-07-05).
Lis operium/research/handoff-fractanet-embryon-2026-07-05.md et operium/docs/fractanet-mesh.md (section Embryon).
Branche active: wip/fractanet-embryon dans ~/srv/cogentia/repos/operium.
Registre privé: registre-mariani/operium/registry/resources.yaml.
Prochaine priorité au choix: (5) disque ThinkPad + fiabilité Termux, (6) rpi3-view services, ou (7) Phase 2 blackboard routing.
```

## Open work (priority order)

1. ThinkPad disk cleanup (~8 GB free).
2. `poco-jhr` Termux reliability (boot sshd, wake-lock, battery exclusions).
3. Validate one real coding session on phone (`grok` or `agent-codex` on a corpus repo).
4. `rpi3-view`: `viewer.env`, corpus rsync, domotics, site-edge attractor.
5. Phase 2 Guide routing from blackboard ([cogentia#42](https://github.com/JeanHuguesRobert/cogentia/issues/42)).
6. Fallback policy A/B/C when laptop offline.
7. Merge operium PR `feature/operium-wip-handoff` when satisfied.

## What operium WIP does / does not do

| Carried | Not carried |
|---------|-------------|
| Git commits, branches, docs | Grok chat transcript |
| `research/handoff-*.md` in repo | `~/.cogentia/secrets/` (local only) |
| Public operium method | Full PC session JSONL |

Conversation continuity = **this file + registre-mariani + fractanet-resumption handoff**, not the chat UI history.