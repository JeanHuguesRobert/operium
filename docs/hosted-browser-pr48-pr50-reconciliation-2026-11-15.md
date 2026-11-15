---
title: "Hosted Browser recovery from historical PRs #48 and #50"
date: "2026-11-15"
document_role: operational
document_kind: reconciliation-report
visibility: public
lifecycle_state: working
status: verified-source-partial-runtime
related_issues:
  - "https://github.com/JeanHuguesRobert/operium/issues/25"
  - "https://github.com/JeanHuguesRobert/operium/issues/49"
---

# Source and live-state reconciliation: Hosted Browser historical PRs #48 and #50

Objective: retain useful historical capacity while correcting insecure and stale implementation choices, without conflating a source commit with a live deployment or a root-authorized effect.

## Proof of deployed historical work

On 2026-11-15, read-only SHA-256 comparison established that the Fracta2 installed launcher, supervisor, workspace configurator, Openbox templates and local health menu correspond to the historical PR #50 blobs; the live gateway has two local-only KasmVNC and CDP endpoint pairs. Their presence contradicts any earlier suggestion that the experimental branch had never been installed. No root-owned configuration file contents or credentials were copied into this report.

The old deployed launcher includes an explicit SecurityTypes None parameter alongside PasswordFile. That parameter's relation to KasmVNC web authentication needs a direct protocol-level test; public Caddy Basic authentication and local-only ports do not establish a second, independent VNC authorization layer. The canonical source recovered in main omits SecurityTypes None, preserves PasswordFile and loopback binding, and shell-quotes all generated runner variables. **Source fixed is not deployed fixed**: the installed root-owned launcher was neither replaced nor restarted by this reconciliation. The explicit super-mode EXPOSE probe for an exact installation command succeeded, but produced no independent issuer, mandate, budget or effect-bound grant. The execution route preflight reported effect_authority_unverified. No privileged operation was attempted through an alternate channel.

## Recovered source and tests on main

- ab6a54d: advisory kiosk/desktop assurance vocabulary with explicit non-admissibility of caller-provided waiver labels, plus bounded existing CI result supervisor semantics
- 28c7866 and 155f804: redacted workspace inventory, with honest incomplete status for unreadable private environment files
- 0c960f7: supervised kiosk/desktop launcher, Openbox desktop/kiosk menus, bounded browser crash-loop supervisor, restart/close/logout helpers and explicit independent VNC authentication configuration; test with a hostile start URL and a fake crashing browser
- 9d9a21f: historical FractaNode and health pipe menus; XML smoke, no service modification
- 9604d0c: historical root workspace configurator with FBF preservation of unrelated environment values; dry-run fixture exercises kiosk plan and rejects undeclared desktop authorization, without writing or restarting
- 3c84fd2: separate PR #74 snapshot-verified developer worker, default dry-run with explicit execute flag, dedicated GitHub Actions conformance suite

All locally executed tests for these modules passed; GitHub Actions CI and packet consumer were successful on commits through 9604d0c. Actual hosted-browser user-session authentication after a source install remains unverified.

## Older branch features not suitable for automatic restoration

| Historical artifact | Decision and scope |
| --- | --- |
| scripts/ops/list-hosted-browser-workspaces.sh | Superseded by credential-redacted Node inventory and its incomplete evidence state |
| scripts/ops/migrate-hosted-browser-user.sh | Do not restore: rewrites credentials to a deterministic sesame based on an email local part, and may rename Unix identities and restart sessions; migration capability belongs to #25 with independently provisioned private credentials |
| scripts/ops/set-hosted-lab-sesame.sh | Do not restore: deterministic lab credential is not a production authentication system |
| scripts/ops/patch-caddy-browser-realm.py | Reject as stale: hard-coded host/network target and a public hint displaying a lab password; current Caddy routes and identity policies require a separately verified configuration |
| templates/hosted-browser/Caddyfile.browser.fragment and templates/caddy/Caddyfile.browser.fractavolta.fragment | Historical public-site configuration; do not replace current Caddy routes or certificates, even if useful for documenting the transition |
| scripts/test-hosted-browser-provision.js | Obsolete expectations expressly accept deterministic sesame, and do not verify current security contract; replaced by focused tests in main |
| scripts/ops/bootstrap-hosted-dev-workspace.sh and install-vscode-insiders.sh | User-specific developer workspace bootstrap, not a prerequisite for browser login; re-evaluate under dev-environment package rather than Caddy/session rollout |
| templates/hosted-browser/navigation-assistant-gateway.service | Historical fixed-user systemd unit, already superseded by a different live installed unit; not an exact source/deployed match. Preserve original PR and review service ownership separately |
| scripts/ops/provision-hosted-browser-user.sh | Already exists on main with existing password-file validation; do not regress to the old provisioner tied to lab sesame |

## Acceptance boundaries not crossed

The source development work was performed with normal repository permissions and narrowly staged Git commits, following optimistic main-first reconciliation. The real Fracta2 launch script has not been updated, and live systemd units and reverse proxies have not been restarted. A capable super executor is reachable, but a mandate-derived effect grant was not verified; a successful EXPOSE is not approval. A future roll-out must compare exact file SHA, preserve a rollback copy, verify direct local KasmVNC authentication, then check public Caddy HTTP/WebSocket session behavior before claiming that the live authentication defect is fixed.

The historical branches remain intact for provenance. The owner packets #25 and #49 remain open for real runtime admission, migration and deployment acceptance. The PRs themselves can be marked superseded once the remaining historically useful work is explicitly linked here.
