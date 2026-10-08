---
title: "Fracta2 GitHub Actions ephemeral runner pilot"
date: "2026-10-08"
status: "proposed — not deployed"
document_role: "operational"
document_kind: "runbook"
visibility: "public"
related_issue: "https://github.com/JeanHuguesRobert/operium/issues/3"
---

# Fracta2 GitHub Actions runner — controlled reality test

## Evidence / status

This is a **deployment proposal**, not a statement that a runner is installed or that fracta2 is healthy. Existing GitHub compute in `inseme` uses `ubuntu-latest`; the GitHub runner administration inventory could not be read from the available connector. Existing `inseme` repository webhook (2026-09-27) delivers observations to `https://jhn.baronsmariani.org/api/webhooks/github` and is **not** a GitHub Actions self-hosted runner. Avoid creating another webhook.

## Purpose and boundary

Run one bounded, deterministic, unprivileged computation on a self-hosted **ephemeral GitHub Actions runner**, provisioned on fracta2 *only if Operium preflight approves the host*. This tests placement within operator-controlled hardware, not by itself confidential computation: GitHub remains an external control plane. Membership in Tailscale is neither execution authorization nor workload isolation.

**Security acceptance prerequisite:** A separate VM or appropriately hardened isolation boundary must prevent runner jobs from accessing the host's ONA, Agent Gateway, Docker socket, SSH agent, metadata endpoints, production credentials, and unrestricted tailnet routes. Running arbitrary Actions jobs as the fracta2 host user is **not approved**. Prefer a dedicated disposable VM with egress allowlisting and no tailnet access to production peers, despite being hosted by fracta2. A dedicated user and systemd service alone are insufficient for untrusted workflows.

## Stage A — read-only preflight (from authorized tailnet operator)

```bash
operium backlog list --kind bug --status openish --human
operium backlog gate --subsystem ona --json
operium up --json
operium node status --json
operium observe nodes --registry "$OPERIUM_REGISTRY" --node resource://fracta2
```

Do not paste private registry, tokens, environment values or node IPs into public issues. Check factual host CPU, available RAM/disk, architecture, virtualization support, existing production services, and headroom. Confirm `fracta2` is suitable rather than assuming it. Record observation timestamp, node identity and the exact command outcomes. If the FBF gate blocks, resolve or explicitly waive before any feature rollout.

## Stage B — admission / installation

1. Verify GitHub Actions runner inventory in the **repository's administrative UI** (not available via current connector).
2. Prefer a dedicated runner group restricted to the trusted repository and restrict workflow/job eligibility. Configure an explicit label such as `fractanet-compute-experimental`; never change production workflows to `self-hosted` generically.
3. Provision an isolated disposable execution environment with a supported OS/architecture, no production secrets, no privileged socket mounts, no host paths, no inbound public listener and only essential outbound connectivity to GitHub services.
4. Retrieve the **current official Actions runner release and registration steps from GitHub Settings → Actions → Runners** immediately before install. Use a short-lived registration token only inside the trusted installation environment; do not record it in Git, the job output, chat or logs.
5. Register as an **ephemeral** runner (`--ephemeral`) with restricted runner labels and no default labels (`--no-default-labels`, if available in that release); one job per isolated instance. Arrange lifecycle cleanup after job completion. Runner image updates and supply-chain verification must be part of the bootstrap.
6. Keep GitHub-hosted `ubuntu-latest` jobs unchanged. Only a new manual, scoped smoke workflow may target the experimental label. Do not use PR-triggered arbitrary code on this privileged surface.

## Stage C — minimal smoke

A manually dispatched workflow should use `runs-on: [self-hosted, fractanet-compute-experimental]`, permissions `contents: read` or less, no repository or host secrets, bounded timeout, and compute only a deterministic checksum or integer arithmetic. Return: run URL, commit, runner label, start/finish, exit status, expected/result values, and checksum. Never log sensitive environment information or whole `tailscale status`.

**Semantic proof:** The actual `runs-on` target and runner name in the GitHub job evidence must indicate the self-hosted runner. Merely observing a GitHub-hosted run or a webhook callback is not proof of fracta2 execution.

## Stage D — follow-up

Compare the identical workload on GitHub-hosted and self-hosted runners. Measure queue time, runtime, bytes transmitted, peak RSS, CPU and energy where measurable. Separate `job succeeded`, `callback delivered`, `effect authorized` and `result committed`; receipt persistence and idempotency remain COP concerns. Decommission disposable execution environment at completion, then verify no lingering credentials, processes or network authorizations.

## Stop conditions / rollback

Stop without installing if host capacity is unknown, ONA gate is blocked, runtime isolation is unverified, token handling cannot remain private, or workflow restrictions cannot be enforced. Disable runner/job eligibility and remove isolated worker using the official GitHub removal procedure; keep Operium incident/decision evidence. Avoid touching fracta2 production services.

## Related references

- https://github.com/JeanHuguesRobert/operium/docs/operium-node-agent-install.md
- https://github.com/JeanHuguesRobert/operium/blob/main/docs/fracta-trust-perimeter.md
- https://github.com/JeanHuguesRobert/inseme/blob/main/docs/github-webhook-ingress.md
- https://github.com/JeanHuguesRobert/inseme/blob/main/docs/github-actions-generic-program-compute.md
- https://github.com/JeanHuguesRobert/inseme/blob/main/docs/github-compute-store-forward.md
