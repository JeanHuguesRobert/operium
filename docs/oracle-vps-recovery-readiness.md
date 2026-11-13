---
title: Oracle OCI VPS recovery readiness for FractaNodes
description: Bootstrap and acceptance tests for access independent of SSH/Tailscale and Cogentia MCP.
document_role: operational
document_kind: runbook
visibility: public
lifecycle_state: working
update_policy: UP-DEFAULT-REVIEWED
language: en
license: CC BY-SA 4.0
last_modified_at: 2026-11-01
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/oracle-vps-recovery-readiness.md
---

# Oracle OCI VPS recovery readiness

## Objective and independence

A provisioned Oracle FractaNode must have a **tested recovery route outside the
instance's SSH, Tailscale, Cogentia daemon and MCP connectors**. Keep the
bootstrap MCP as a supplementary route until Oracle recovery capabilities have
passed an end-to-end test. Neither the bootstrap MCP nor Oracle Cloud Agent
will repair an OS that cannot boot. OCI's serial console and, as last resort,
boot-volume rescue from a second instance are the independent controls.

This is a **provisioning acceptance criterion**, not a collection of new
agent policies or a second mandate system. FractaTrust/COP continues to govern
ordinary work. OCI account IAM controls access to the *external cloud control
plane*; it is not a new in-agent authorization model.

## Availability matrix

| Capability | Dependency | Recovery value | Acceptance test |
| --- | --- | --- | --- |
| OCI serial console (Cloud Shell) | OCI control plane and VM's serial interface; OS not necessarily reachable | Watch boot, GRUB, maintenance shell and emergency repair | Connect from Oracle Console with SSH/Tailscale unavailable; see output and exercise console interaction |
| OCI console history | OCI control plane | Read past boot errors without working SSH | Capture and read history from OCI Console |
| Compute Instance Monitoring / host-health metrics | Cloud agent for detailed guest metrics; OCI also has agentless health metrics | Identify unresponsive host | Fresh OCI metric visible after provisioning |
| Compute Instance Run Command | OS, Oracle Cloud Agent and plugin; IAM/dynamic group | Execute script when SSH is broken but guest/agent lives | Run harmless `id -u; uname -m` from OCI and receive output |
| OS Management Hub | Supported OS/agent and explicit service configuration | Patching/inventory, **not** a broken-boot rescue | Optional; never a gate to console access |
| Boot-volume detach/attach rescue | OCI compute/block control plane and compatible helper VM | Repair unbootable disk | Document manual route; destructive rehearsal not required |

**Compatibility caveat:** Oracle's Run Command supported-platform-image list
is narrower than Oracle Cloud Agent's plugin list, and does not explicitly
include Ubuntu platform images. Thus `running` on Ubuntu ARM does **not** prove
that OCI Run Command succeeds. A real OCI-side command is the discriminator.
Do not promise that a plugin fixes a non-booting instance.

References:
- https://docs.oracle.com/en-us/iaas/Content/Compute/References/serialconsole.htm
- https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/enablingserialconsoleaccess.htm
- https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/manage-plugins.htm
- https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/runningcommands.htm
- https://docs.oracle.com/en-us/iaas/Content/Block/Tasks/recoveringlinuxbootvolume.htm

## Critical distinction: serial output is not recovery access

**Historical incident — fracta, 26 October 2026:** after the Ubuntu 26.04.1
migration, the OCI serial console **was reachable** and displayed
`fracta login:`. The Ubuntu image relied on SSH public-key access and the `ubuntu`
account had **no configured local password**. The serial login therefore
could not authenticate, and no administrator shell was obtained. Separately, SSH port 22 refused
connections and alternate SSH port 1022 reset before authentication. OCI
Run Command was not operational on that instance. Thus the earlier claim
that its Oracle serial console was *not enabled* was inaccurate: **console
transport worked; repair access did not**.

**Operational disposition of the legacy node:** the Principal chose to
abandon restoration of `fracta`, not because repair was proved impossible,
but because its initial Ubuntu image / provisioning was a poor fit for the
available Oracle Always Free resources, and keeping a second, historically
inherited node added architecture and maintenance complexity without a
corresponding immediate benefit. The intended architecture consolidates
current work on `fracta2`. This is a **decision to retire**, not evidence
that the instance, boot volume, cloud resources, DNS, or service dependencies
have already been deprovisioned or fully migrated. Verify those separately
before any deletion or final teardown.

Oracle documents a second Ubuntu-specific issue: the GRUB boot menu can be
hidden on instance serial consoles, preventing maintenance/recovery-mode
access without preparation. This must be addressed **while SSH works**;
seeing a login prompt is not proof that the GRUB recovery path works.
Reference: https://community.oracle.com/customerconnect/discussion/650872/oci-how-to-configure-ubuntu-instances-to-display-grub-menu

**Acceptance criterion:** demonstrate a viable administrative repair path
from OCI without normal SSH or a running MCP, either through a deliberately
tested GRUB/recovery interaction or a separately controlled local console
login. A dedicated, controlled local console-login credential is one valid
recovery option if deliberately maintained; a proven GRUB/recovery procedure
is another. Prefer whichever has the least ongoing burden and is demonstrably
usable. Never rely on SSH-only authentication to unlock a serial login. Do not cause a production reboot solely
for this check without an operator-approved maintenance window. A serial
login prompt alone is **insufficient**.

## Principal decision: simple password-based console recovery (2026-11-01)

The Principal deliberately accepts a **single, simple recovery arrangement**
under uncertainty, rather than multiplying preventive security layers. Each
Oracle VPS should have a known, tested way to log into its local Linux console
when SSH and both MCP interfaces are unavailable, followed by a working
`sudo` path for administrator repairs. This local console account is an
availability mechanism, **not** a second COP mandate authority.

The Principal currently relies on Gmail as a practical root-of-recovery for
his digital access and does not request a new password-management
infrastructure. **Do not put the actual Gmail account password into a VPS's
Linux password database.** A distinct strong Linux-console password can be
kept in the Principal's existing secure recovery records without creating
another account or service. Reusing the *same secret* for Gmail and a VPS
would make compromise of the VPS a direct Gmail compromise; this is an
avoidable coupling, not a demand for an infinite security program. Do not
record password values in Git, logs, tickets or conversation transcripts.

Provisioning test: confirm that the chosen local account can authenticate
through the **OCI serial console** and run `sudo -v` (or a harmless
`sudo -n id -u` where passwordless sudo is already configured), without
requiring SSH. The existence of the password, and the success of this test,
are two separate facts. Do not mark the node recoverable until tested.

## Standard OCI provisioning: ensure the rescue connection

Operium owns this acceptance gate. The requirement applies to **every new OCI FractaNode**, whether or not it has a public IPv4 address, and also to migration and major OS upgrade preflights.

On an **OCI-authenticated control workstation or OCI Cloud Shell** (not inside an uncredentialed VPS), provision or discover the console connection:

```bash
bash scripts/ops/ensure-oci-console-connection.sh \
  --instance-id "$OCI_INSTANCE_ID" \
  --ssh-public-key-file "$HOME/.ssh/id_ed25519.pub"
# After reviewing the plan, create only if missing:
bash scripts/ops/ensure-oci-console-connection.sh \
  --instance-id "$OCI_INSTANCE_ID" \
  --ssh-public-key-file "$HOME/.ssh/id_ed25519.pub" --apply
```

The helper discovers the instance compartment using OCI, checks existing ACTIVE/CREATING connections and is **idempotent**. Default mode is read-only; `--apply` performs one OCI-side creation only if missing. Oracle IAM must authorize reading the instance and managing console connections. This creates a *transport credential*, not a guest `root` account or a Linux console password. No secret or private key is placed in Git.

Follow with `bash scripts/ops/check-oci-recovery-readiness.sh` **on the guest** and a real independent OCI console session. Verify an actual guest login capable of `sudo` or a tested GRUB recovery path. Do not mark provisioning accepted based only on the successful OCI API call, an ACTIVE connection, `login:` on screen, or a locally active `serial-getty`. For ARM OCI instances the relevant device is normally `ttyAMA0`, not `ttyS0`.

Record the four separate states in the provisioning receipt: `console_connection_created`, `guest_serial_getty_available`, `interactive_recovery_tested`, `sudo_or_grub_repair_tested`. Use `true`, `false` or `unknown` with test date and evidence reference; only the final two establish usable recovery. Do not persist credentials, private OCIDs or a recovery password in published receipts.

The **outbound Bootstrap MCP is independently required** as an SSH-free, public-IP-free operational recovery path. It must start at boot, reconnect after an outage and be tested without depending on SSH or normal Cogentia MCP. Neither route replaces the other; see [Cogentia Bootstrap MCP architecture](https://github.com/JeanHuguesRobert/cogentia/blob/main/docs/bootstrap-mcp-recovery-channel.md).

## Provisioning acceptance procedure

1. Check OCI console access and the instance's compartment. The operator needs IAM permissions to `manage instance-console-connection` and `read instance` in the applicable scope. Do not copy private account IDs or keys to public Operium.
2. On the VPS, run `bash scripts/ops/check-oci-recovery-readiness.sh`. On ARM, the console is `ttyAMA0`, not `ttyS0`. Verify kernel output and active `serial-getty@ttyAMA0`. `enabled-runtime` can be normal when systemd generates getty from the kernel console setting.
3. In **Oracle Console**, Compute → Instances → [node] → Console connection → **Launch Cloud Shell connection**. Press Enter and verify actual terminal interaction independently of node SSH. A visible `login:` prompt is **not a passing result**: demonstrate a usable repair login or a tested GRUB/recovery path. A cloud account without an OS password does not automatically provide interactive serial login; do not enable a permanent shared password by default.
4. In Oracle Console, capture and view **Console history**, separately from a live serial-console session.
5. In Compute → Instances → [node] → **Oracle Cloud Agent**, verify the **OCI-side** plugin state. If Run Command is supported and IAM configured, use Run command to execute the harmless probe `id -u; uname -m`. A `running` plugin in a guest log is insufficient. OCI documents IAM policies including a user group for `instance-agent-command-family` and a dynamic group for `instance-agent-command-execution-family`: https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/instances.htm
6. Verify recent OCI monitoring and instance-health metrics. Do not actually reboot or detach boot volumes during a routine readiness test.
7. Record each capability as **advertised / locally running / control-plane reachable / actually tested** with a dated evidence receipt, or identify the exact missing boundary. Retain the bootstrap MCP until an independent route has passed the real test.

## Fracta2 observed baseline — 2026-11-01

- Ubuntu 24.04.5 LTS on a VM.Standard.A1.Flex ARM64 platform.
- Oracle Cloud Agent snap `1.61.0-6` installed; agent and updater running.
- `/dev/ttyAMA0` exists; active kernel command line includes `console=ttyAMA0`.
- `serial-getty@ttyAMA0.service` active, `enabled-runtime`; disabled `ttyS0` is irrelevant on ARM.
- Oracle Agent log reports `runcommand` and `gomon` `Enable/running`; `oci-osmh` `Disable/notStarted`.
- Local `oci` CLI not found (not required for Oracle Cloud Shell).
- **Still unverified:** IAM, actual Cloud Shell serial connection, GRUB/recovery login, OCI console history, a real OCI-side Run Command, and visible OCI metrics. No reboot or service changes were performed in this local audit.

## Gate before distribution upgrades and rescue plan

A critical in-place OS upgrade must not proceed on a node whose OCI serial-console connection has never been demonstrated. This is more important than installing additional speculative monitoring agents. For an unbootable disk, Oracle documents stop → detach boot volume → attach as data volume to a compatible helper instance in the same availability domain → repair → detach → reattach → boot. This is a last-resort procedure, not a provisioning rehearsal: https://docs.oracle.com/en-us/iaas/Content/Block/Tasks/recoveringlinuxbootvolume.htm

Oracle Cloud Agent, optional OS Management Hub and third-party management agents require a running OS; none is an independent replacement for a hypervisor-backed console. The objective is a **tested repair capability**, not additional policy layers or agent reputation systems. COP/FractaTrust remain the agent-governance mechanisms.
