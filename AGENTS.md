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

## Direct-main rule

This repository follows **Optimistic Mainline Governance** by reference, not by copying the doctrine here.

Small direct commits to `main` are acceptable when explicitly authorized, scoped, reversible, inspectable by diff, and reported after completion.

For `operium`, direct-main work is appropriate for small documentation updates, registry entries, health notes, risk notes and decision traces.

Use an issue, checkpoint, branch, PR, staged patch or human validation when a change touches private operational details, broad structural changes, public/private boundaries, or several repositories at once.

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
