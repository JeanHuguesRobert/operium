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

## Provisioning acceptance procedure

1. Check OCI console access and the instance's compartment. The operator needs IAM permissions to `manage instance-console-connection` and `read instance` in the applicable scope. Do not copy private account IDs or keys to public Operium.
2. On the VPS, run `bash scripts/ops/check-oci-recovery-readiness.sh`. On ARM, the console is `ttyAMA0`, not `ttyS0`. Verify kernel output and active `serial-getty@ttyAMA0`. `enabled-runtime` can be normal when systemd generates getty from the kernel console setting.
3. In **Oracle Console**, Compute → Instances → [node] → Console connection → **Launch Cloud Shell connection**. Press Enter and verify actual terminal interaction independently of node SSH. Confirm the GRUB/recovery path or another managed way to log in. A cloud account without an OS password does not automatically provide interactive serial login; do not enable a permanent shared password by default.
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
