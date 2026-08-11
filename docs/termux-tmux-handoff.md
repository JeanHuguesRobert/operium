---
title: "Termux tmux handoff"
description: "Bounded remote relay into a named Termux tmux session."
date: "2026-08-06"
language: en
document_role: operational
document_kind: method
visibility: public
lifecycle_state: active
update_policy: UP-DEFAULT-REVIEWED
related_issue: "https://github.com/JeanHuguesRobert/operium/issues/19"
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "explicit-metadata"
classification_confidence: "medium"
---

# Termux tmux handoff

This procedure supports a **human-authorized relay** into a named `tmux`
session on a trusted Android/Termux node such as `poco-jhr`.

It is not Android remote control. SSH opens the transport; `tmux` remains the
native session authority. The local human can always inspect or attach to the
same session.

## Boundary

```text
Operium helper -> trusted mesh SSH -> named tmux session -> native CLI
```

The helper deliberately does not accept an arbitrary remote shell command,
does not start an agent, and does not use ADB, accessibility services, or GUI
keyboard injection.

## Commands

Run from a trusted controller with an SSH alias for the Termux node:

```bash
# Create an empty persistent session.
node scripts/ops/termux-tmux-handoff.js start --session fbf-dashboard

# Inspect it without changing it.
node scripts/ops/termux-tmux-handoff.js status --session fbf-dashboard
node scripts/ops/termux-tmux-handoff.js capture --session fbf-dashboard --lines 120

# Review a local handoff text, then send it deliberately.
node scripts/ops/termux-tmux-handoff.js send \
  --session fbf-dashboard \
  --file /trusted/path/handoff.txt \
  --i-am-present
```

`send` pastes the file literally through a temporary tmux buffer and then sends
Enter. The command returns a SHA-256 of the payload but does not persist or log
its body. Use `--dry-run` to validate a request without connecting.

On the phone, the human resumes the same session with:

```bash
tmux attach -t fbf-dashboard
```

## Safety rules

- Use a simple, known session name; the helper rejects shell metacharacters.
- Review the file before `send`; require `--i-am-present` for every injection.
- Do not put secrets in the handoff file or terminal capture.
- Do not treat terminal text as evidence of a completed external action. Inspect
  the native tool, its receipts, and the relevant Git/COP/Operium source.
- Record consequential relays in the relevant issue, continuation packet, or
  operational trace using the payload SHA-256 and resulting native references.

## Observed proof

On 2026-08-06, a trusted operator created `fbf-dashboard` on `poco-jhr`,
synchronized Cogentia and Operium, executed the CPKT-2026-006 handoff script,
started Codex locally, and sent the bounded resume prompt through the named
tmux session. The continuity receipt on the phone recorded the exact Git SHAs.

This proves the relay mechanism for that session only. It does not prove that
Termux `sshd` survives Android process eviction or reboot; that remains the
separate scope of Operium issue #6.
