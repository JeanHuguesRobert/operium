---
title: "Fracta2 development environment"
document_role: operational
document_kind: capability-status
visibility: public
lifecycle_state: active
language: en
date: "2026-09-10"
last_modified_at: "2026-09-10"
update_policy: UP-INFRASTRUCTURE-HEALTH
---

# Fracta2 development environment

On 2026-09-10 the operator requested development capability improvements after
comparing the phone workspace with Fracta2. This record covers the installed
build environment; it does not grant new authority to publish, deploy, copy
credentials, or restart services.

## Installed baseline

Fracta2 is an Ubuntu 24.04.4 ARM64 host with two available CPUs and 11,927 MiB
RAM. After provisioning, approximately 30 GB of filesystem space remained.

| Capability | Observed result |
|---|---|
| C/C++ builds | GCC/G++ 13.3, Make, CMake 3.28.3 and pkg-config installed |
| Python | Python 3.12.3 with venv and pip; isolated environment creation verified |
| JavaScript / TypeScript | Existing Node 22.23.2 and npm; Deno 2.9.6 and pnpm 10.28.2 added |
| Coding agents | Codex 0.154.0 and Claude Code 2.1.268 installed; both report not logged in |
| GitHub CLI | gh 2.45.0 installed; not logged in |
| Utilities | ripgrep and unzip added; jq and rsync already present |
| Persistent work | Existing tmux and systemd available; browser/ONA services remain active |

The npm tools are owned by `ubuntu` under `/home/ubuntu/.local`; npm's user
prefix now points there. Login-shell command discovery was verified. No
credentials were transferred and no paid model invocation was performed.
Package installation follows the official [Codex CLI](https://developers.openai.com/codex/cli/),
[Claude Code](https://code.claude.com/docs/en/installation), and
[Deno](https://docs.deno.com/runtime/getting_started/installation/) documentation.
The deployed versions are pinned in the bootstrap script; pnpm matches
Inseme's declared package manager.

## Repository availability

Fresh clones use their upstream default branches, without changing the existing
Operium work-in-progress checkout or the private registry checkout.

| Repository | Branch | Observed commit |
|---|---|---|
| cogentia | main | `8b6c395dff059bc311c0a4ea236ba8032c54b3d1` |
| inseme | main | `16d5a567a476cb2b9202f007e2a80c51d1f7aa39` |
| Inox | master | `3eb13de2c6bb1a9cb5c6d6633268dd0191f98ed6` |

All are under `/srv/cogentia/repos`. `/srv/cogentia/work` is available for
build artifacts. Inox dependencies were installed with `npm ci`; other new
clones still need their project-specific dependency setup before building.
Read each repository's AGENTS.md before working there.

## Use from the phone or another mesh node

From a machine with the `fracta2` SSH alias configured:

```bash
ssh fracta2
cd /srv/cogentia/repos/Inox
npm run build
npm run test:session
```

For unattended SSH commands, use a login shell or an explicit user-tool path:

```bash
ssh fracta2 'bash -lc "codex --version && deno --version && pnpm --version"'
```

The verified route from this phone session was SSH through `fracta` to
`fracta2`. Local assistant connectors do not automatically transfer to a
remote CLI. Agent and GitHub sign-in remain operator steps using their normal
login flows. Start builds with one worker where supported, leaving headroom
for the hosted browser; measure before increasing concurrency.

## Provisioning and recovery

- Profile: [`tools.fracta2-dev.v1.yaml`](../profiles/tools.fracta2-dev.v1.yaml).
- Bootstrap: [`bootstrap-fracta2-dev.sh`](../scripts/ops/bootstrap-fracta2-dev.sh), run as `ubuntu` on Fracta2.
- The bootstrap preserves existing checkouts, uses apt for system packages and user-owned npm installs for CLIs, and never runs sudo npm.
- Apt added 55 packages and upgraded eight required libc/Python-related dependencies. `--no-upgrade` does not prevent dependency upgrades needed by newly installed packages.
- `NEEDRESTART_MODE=l` reported restart needs without automatically restarting services. Browser, gateway, ONA and Caddy remained active; CDP still responded after provisioning. Existing processes may retain old libraries until a maintenance restart.
- Recovery is package-specific: user npm tools can be uninstalled by package name; fresh clones and generated outputs can be removed after checking for new work. Do not blindly autoremove packages or downgrade shared libraries. A full system rollback was not provisioned.
- Docker, Rust and Go were not installed by this change. They remain project-specific additions rather than verified capabilities.

## Validation

Passed: bootstrap shell syntax; native C program configured and compiled with
CMake then executed; Python venv creation and pip invocation; Deno TypeScript
checking and execution; Node test runner with in-memory native SQLite; CLI
version commands; login-shell PATH discovery; hosted service status and CDP
metadata response.

The Inox runtime compiled successfully. An initial session test failed because
the first build deliberately used an alternate output directory while the test
expects `builds/inox.js`. The normal project build is the required prerequisite;
this was a validation setup error, not evidence of a toolchain failure.
After `npm run build` in the normal output directory, `npm run test:session`
reported `ok: true` for the six-turn retrieval/continuation/fulfillment/mandate
loop. The test did not terminate normally after reporting success: its
`child.kill()` teardown left local test servers/workers alive. Only processes
matching the test-specific environment token and Inox working directory were
terminated. Treat this as passed assertions with a teardown defect, not a
clean unattended-test result. For future checks, bound test lifetime and
verify child cleanup; the Inox teardown itself was not changed here.

Sign-in, paid agent calls, reboot recovery, browser visual interaction, and
full Inseme/Cogentia builds were not validated. Maintenance restart scheduling
and agent sign-in require operator involvement.
