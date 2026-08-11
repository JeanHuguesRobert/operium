---
shared_instructions: https://github.com/JeanHuguesRobert/cogentia/blob/main/instructions/AGENTS.shared.md
document_role: "operational"
document_kind: "agent-mandate"
visibility: "public"
lifecycle_state: "active"
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "agent-mandate"
classification_confidence: "strong"
---

# AGENTS.md — Operium agent mandate

This file gives operational instructions to AI agents and human assistants working in the `JeanHuguesRobert/operium` repository.

It is not the full doctrine. It is the compact local mandate for maintaining a versioned operational environment registry.

Operium is the infrastructure-health evidence layer for the wider corpus. Cogentia defines the
corpus-level mandate and traceability invariant; Operium records service health, deployment state,
capability availability, and recovery evidence. Do not treat hidden configuration as a security
boundary, and do not infer availability from a mandate alone.

## Repository role

`operium` documents operational environments:

```text
current state
+ intended evolutions
+ health
+ risks
+ incidents
+ decisions
+ public/private separation
```

It is not a monitoring tool first. It is a versioned operational memory that can later connect to scripts, dashboards, probes, agents and AI assistants.

## Methodological references

Apply Cogentia by reference:

- [`cogentia/research/agent_configuration_layer.md`](https://github.com/JeanHuguesRobert/cogentia/blob/main/research/agent_configuration_layer.md)
- [`cogentia/research/optimistic_mainline_governance.md`](https://github.com/JeanHuguesRobert/cogentia/blob/main/research/optimistic_mainline_governance.md)

## Core instruction

Before modifying this repository, distinguish:

```text
fact
assumption
intended evolution
incident
risk
decision
private data
public view
operational health
```

Do not present an intended evolution as current state.  
Do not present an assumption as a verified fact.  
Do not expose private operational details in public views.

## Language and audience

Conversation with Jean Hugues Robert may follow his language, including French.
Repository artifacts must instead serve Operium's international and generic
scope:

- Write public GitHub Issues, pull requests, comments, commit messages,
  documentation, schemas, CLI output and user-facing UI copy in English by
  default.
- Preserve source quotations and proper names in their original language when
  useful; add an English explanation when the surrounding artifact is public.
- Use another language only when the artifact explicitly targets that language
  or Jean Hugues Robert requests it for that specific artifact.
- Do not infer a Francophone product scope from a French operator conversation.
- Prefer terminology that remains meaningful outside the current deployment,
  while keeping concrete Fracta/Fractanet evidence in examples and runbooks.

## Fix Bugs First (mandatory for interactive work)

When Operium (or an ops-touching session) feels **out of control**, apply
[`docs/fix-bugs-first.md`](docs/fix-bugs-first.md):

1. `operium backlog list --kind bug --status openish --human`
2. `operium backlog gate --subsystem <slug>` before feature work in that slug
3. Prefer fixing or waiving **bugs** over opening new features
4. Update `backlog/items.yaml` (authority); GitHub Issues are the discussion mirror

Do not invent a parallel ops path that bypasses the backlog.

## Direct-main rule

This repository follows **Optimistic Mainline Governance** by reference, not by copying the doctrine here.

Small direct commits to `main` are acceptable when explicitly authorized, scoped, reversible, inspectable by diff, and reported after completion.

For `operium`, direct-main work is appropriate for small documentation updates, registry entries, health notes, risk notes and decision traces.

Use an issue, checkpoint, branch, PR, staged patch or human validation when a change touches private operational details, broad structural changes, public/private boundaries, or several repositories at once.

## Operational deployments

**Operium owns operational deploy state** for Fractanet/fracta (health, desired
routing, secret *references*, apply procedure, evidence). Application repos
(cogentia, inseme, …) may ship unit scripts and config *fragments*; agents must
not invent a second control plane under those repos.

- Observe: `operium up`, `operium node diagnose`
- Action plane: `operium invoke tool` (optionally `--via guide`)
- Fracta Guide synthesis routing: `docs/magistral-coding-agent-routing.md`

When changing live routing (Caddy, Magistral map, systemd), record the decision
in Operium and update health notes. Do not leave operational runbooks only under
`cogentia/deploy/`.

**Stigmergy for other agents:** the same rule is mirrored in the Cogentia corpus
(`cogentia/research/operium_owns_operational_deploy.md`), workspace `Claude.md` /
`GROK.md`, and Claude memory `feedback_operium_owns_ops.md`.

## Operational discipline

When editing registry material, preserve:

- repository/path clarity;
- date of observation or decision;
- distinction between observed state and intended change;
- health score or uncertainty when relevant;
- known risks;
- next action;
- public/private classification.

## Validation

Before presenting work as ready, report:

```text
Scope:
Files changed:
Operational facts changed:
Assumptions added or modified:
Checks run:
Known risks:
Reversibility:
Next step:
Human validation needed: yes/no
```

If no operational check was possible, say so explicitly.

## Authorization rule

Agents may prepare, draft, summarize, route, compare, inspect and propose.

Agents must not commit, push, publish or otherwise stabilize an action unless Jean Hugues Robert has given explicit, scoped authorization for that operation.

When authorization is ambiguous, prepare the batch and ask before acting.

### Standing authorization — `poco-jhr` (2026-07-29, permanent until revoked)

Jean Hugues Robert granted **standing autonomy** on the Termux node `poco-jhr`
(SSH alias `poco-jhr`). Agents with mesh SSH **must act without re-asking** for:

| In scope (do freely) | Out of scope (still ask) |
|----------------------|---------------------------|
| Git hygiene: `fetch --prune`, checkout default `main`/`master`, `pull --ff-only`, delete local non-default branches | Force-push, `reset --hard` of unique unpushed work, rewrite published history |
| Sync corpus checkouts to origin default branch when clean / ff-only | Merging or discarding ambiguous unique WIP without a saved patch under `~/srv/cogentia/work/` |
| Shell profile install/refresh (`profiles/shell/termux-android.profile.sh`, `install-termux-shell-profile.sh`) | Changing secrets under `~/srv/cogentia/secrets/`, rotating keys |
| Re-run `scripts/ops/phone-branch-cleanup.sh` or equivalent | Stopping/restarting live ONA / agent-gateway in a way that may drop an active agent session without need |
| Inspect status, logs (non-secret), health | Pushing to GitHub from the phone unless the session already has scoped push auth for that change |

**Revocation:** only an explicit message from Jean Hugues Robert that changes this
rule. Do not re-prompt for the in-scope items in later conversations.

Record: conversation 2026-07-29; also `profiles/tools.termux-android.v1.yaml`
(`agent_autonomy`) and `docs/workstation-shell-profile.md`.
