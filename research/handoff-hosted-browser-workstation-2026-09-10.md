---
title: "Handoff — Hosted Browser and workstation recovery (2026-09-10)"
description: "Portable operational context for the next session, machine, or coding agent."
date: 2026-09-10
status: active
topic: hosted-browser-workstation
document_role: "source"
document_kind: "research-paper"
visibility: "public"
lifecycle_state: "active"
github_issue: null
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "research-paper"
classification_confidence: "medium"
---

# Handoff — Hosted Browser and workstation recovery (2026-09-10)

Portable context for a later session, potentially on this workstation with a
different coding agent. This file is the durable operational summary; it does
not replace source-controlled procedures, incident records, or live checks.
It contains neither credentials nor personal browser data.

## Git and local-state boundary

| Object | State at handoff | Meaning |
| --- | --- | --- |
| `origin/wip/mail-dns-cutover` | `6076f0b` | Hosted Browser source templates and the provisional-workspace acceptance flow were published. |
| Local `wip/mail-dns-cutover` | `d4d27d2` plus this handoff commit | `d4d27d2` is an earlier, unpushed security-detector correction; do not publish it implicitly when publishing this handoff. |
| Working tree | unrelated mail/DNS and shell-profile edits remain | Preserve and classify them independently; they are not part of this handoff. |
| Local stashes | `codex-temporary-pre-rebase-hosted-browser-publish` and older mail/DNS stashes | Do not pop blindly. The temporary stash was retained after rebase because of an untracked-file collision. |

## Hosted Browser: verified work and remaining work

### Done — source and dated live evidence

- The hosted browser health-check script and systemd service/timer templates
  were added under `templates/hosted-browser/`; provisioning enables the timer.
- On 2026-09-10, the `fracta2` health timer was observed running every 30
  seconds for `hosted-jeanhuguesrobert`. A direct KasmVNC check and the public
  Caddy route returned expected authentication denial (`401`), rather than the
  previous persistent `502` after session logout.
- The source procedure is
  [`docs/hosted-browser-kasmvnc-cdp.md`](../docs/hosted-browser-kasmvnc-cdp.md).
  Its provisional personal-workspace acceptance flow is published at `6076f0b`.

### Do not redo; reconcile deliberately

The live `fracta2` launcher was richer than the versioned template: it carries
desktop/kiosk handling and session-supervision behavior which was not fully
reconciled into Operium source. Before changing logout behavior, retrieve the
live unit and launcher, compare them with the templates, and make a small
source-controlled reconciliation.

The semantic correction remains: a user-facing **Logout** must end the user
session, not kill the KasmVNC listener and strand `browser.fractavolta.com`
behind a `502`. The health timer is a recovery guard, not a substitute for that
semantic repair.

## Future provisional workspace: explicitly planned, not created

No workspace, browser profile, Unix account, Principal binding, or personal
record has been created for Frédéric Lecourtois.

The next safe sequence is:

1. Create a synthetic, non-personal acceptance fixture. It is not a Twin and
   carries no named subject, credential, or external identity.
2. Evidence isolation, selected French locale, bounded CDP, and resilience
   against a lasting `502`.
3. Only then create a named **provisional** logical Twin with
   `principal_id = null`; capacity defaults never confer identity, mandate,
   private memory, browser data, credentials, or CDP authority.
4. Treat later Principal claim and any promotion/hydration as separate,
   explicitly approved operations.

The lifecycle specification is in Inseme:
[`provisional-twins-multi-instance.md`](../../inseme/docs/provisional-twins-multi-instance.md).
Shared implementation material remains English; the future user-facing
workspace locale is an explicit per-workspace decision.

## Workstation: active Windows incident

`OP-INC-001` in [`backlog/items.yaml`](../backlog/items.yaml) is the authoritative
typed record for the failed Insider feature updates.

Observed on 2026-09-10:

- update attempts included failures associated with `0xC1900101`,
  `0xC0000005`, and `0x800704C7`;
- Panther compatibility output marked legacy Microsoft printer packages
  `oem66.inf` / `prnms009.inf` and `oem67.inf` / `prnms001.inf` as
  `BlockMigration=True` with unsigned binaries;
- the unused XPS Document Writer queue and visible PnP instance were removed,
  but deletion of `oem67.inf` still reported a remaining device reference;
- a full hidden-device query found no current `oem67.inf` binding.

Resume after a Windows restart: retry deletion of `oem67.inf` **without**
`/force`, verify the driver store, identify the current binding of `oem66.inf`,
then retry the Insider update only after those migration blockers are resolved
or consciously retained. Do not force-delete driver packages.

The earlier TabTip/WerFault loop was contained, not root-caused: Windows Error
Reporting was disabled and accumulated reports were reduced. Recheck it only
if current event evidence shows the loop remains material.

## Resume prompt

```text
Read operium/research/handoff-hosted-browser-workstation-2026-09-10.md and
OP-INC-001. Preserve existing WIP. First reconcile the live Hosted Browser
runtime with source; independently resume the Windows driver-migration incident
only after a reboot and fresh evidence.
```
