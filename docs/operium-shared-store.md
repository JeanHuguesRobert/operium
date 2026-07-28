---
title: "Operium shared store on Fracta"
description: "Private SFTP exchange space for handoffs and reconstructible working-state artifacts."
document_role: operational
document_kind: runbook
visibility: private
lifecycle_state: active
update_policy: UP-DEFAULT-REVIEWED
---

# Operium shared store on Fracta

## Observed state

Bootstrapped and verified on 2026-07-28:

- `/srv/operium-store` and its six first-level directories are mode `0700`,
  owned by `ubuntu:ubuntu`;
- 26 GiB were available on the underlying filesystem at observation time;
- an SCP/SFTP upload-download round trip produced the same SHA-256 locally,
  remotely and after download;
- the disposable verification artifact was removed after the check;
- rclone and WinFsp were not yet installed on the Windows workstation.

## Purpose

Fracta is currently the only permanently reachable Fractanet coding node.
It hosts a private exchange store at:

```text
fracta:/srv/operium-store
```

The store is a rendezvous point, not a unique authority and not a live shared
worktree. PC and Termux keep their active Git worktrees and SQLite working
databases locally.

Transport deliberately reuses SSH/SFTP. Windows may present the store as a
network drive through rclone and WinFsp. Termux should initially use explicit
`rclone copy` and `rclone check` operations so that work remains available
while disconnected.

## Layout

| Path | Role |
|---|---|
| `inbox/` | Upload staging; publish by atomic remote rename |
| `objects/` | Immutable content-addressed artifacts |
| `handoffs/` | Versioned `operium.handoff.v1` manifests |
| `refs/` | Small pointers to current generations |
| `snapshots/` | Closed, verified snapshots such as SQLite caches |
| `archive/` | Superseded manifests retained for provenance |
| `FORMAT` | Store format marker (`operium.shared-store.v1`) |

The root and first-level directories are owned by `ubuntu:ubuntu` with mode
`0700`. Access currently follows the existing SSH identity used by
`ssh fracta`; no additional public service or password database is introduced.

`/srv/sync` is a separate Syncthing-managed directory and must not be reused
for this store.

## Bootstrap and status

From an Operium checkout:

```bash
node scripts/ops/fracta-shared-store.js status
node scripts/ops/fracta-shared-store.js apply
node scripts/ops/fracta-shared-store.js status
```

`apply` is idempotent. It creates directories and normalizes their ownership
and modes; it does not remove stored objects.

## Windows access

Configure an rclone SFTP remote using the existing SSH key and the Tailscale or
SSH alias for Fracta. Do not put a private key or password in the repository.

After `rclone config`, verify before mounting:

```powershell
rclone lsd fracta-store:
rclone mount fracta-store: H: --network-mode --vfs-cache-mode writes --volname Operium-Handoff
```

The remote root should be `/srv/operium-store`. Run the mount as the normal
desktop user so that Explorer and non-elevated development tools see the same
drive.

## Termux access

Prefer an offline-capable local working directory:

```bash
rclone copy fracta-store:handoffs ~/operium-handoffs/handoffs
rclone copy ~/operium-handoffs/outbox fracta-store:inbox
rclone check ~/operium-handoffs/outbox fracta-store:inbox
```

Operium will later wrap these operations as `handoff pull`, `push` and
`resume`.

## Publication invariant

1. Write an object to `inbox/` under a unique temporary name.
2. Compute and compare its SHA-256 on both ends.
3. Rename it atomically into `objects/<sha256>`.
4. Publish the manifest only after every referenced object is present.
5. Update a ref last.

Interrupted uploads therefore remain distinguishable from published objects.

## Boundaries

- Never open the same live SQLite database from several nodes through the
  mounted store. Exchange immutable event batches or closed snapshots.
- Never develop inside a Git worktree located on the mount. Exchange commits,
  bundles, patches and handoff manifests.
- Never publish secret values. A handoff may reference the authority path and
  record presence or a safe fingerprint.
- `/srv/views` remains the public projection store. Private handoff artifacts
  stay under `/srv/operium-store`; redacted views may be derived later.
- The future blackboard, causal graph, temperature-based views, symbolic rules
  and ReactiveSets are exploratory projections over traces. They are not
  requirements of this first SFTP store.

## Verification

```bash
ssh fracta "stat -c '%a %U:%G %n' /srv/operium-store"
sftp fracta
sftp> ls /srv/operium-store
```

A complete round trip must upload a disposable file into `inbox`, compare its
SHA-256 locally and remotely, download it, compare again, then remove only that
test artifact.
