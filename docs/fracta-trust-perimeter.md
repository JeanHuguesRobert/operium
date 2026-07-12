---
title: "Fracta trust perimeter and secrets"
description: "How the fracta VPS fits the trusted operational boundary; where secrets live; retrieval backends including Inox session."
layout: default
date: 2026-07-03
last_modified_at: 2026-07-12
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/fracta-trust-perimeter.md
document_role: "operational"
document_kind: "method"
visibility: "public"
lifecycle_state: "active"
---

# Fracta trust perimeter and secrets

This note records how the **fracta** public VPS is operated inside Jean Hugues Robert's
infrastructure. It belongs in **Operium** (infrastructure memory), not in application
repos alone.

Companion notes:

- [Cogentia Semantic Stack](cogentia-semantic-stack.md) — retrieval components and health checks
- [Public / private split](public-private-split.md) — what must never appear in git
- Cogentia deploy runbook: `cogentia/deploy/fracta/README.md` (procedures on the node)
- Cogentia retrieval phases: `cogentia/docs/retrieval-roadmap.md`
- Inox remote serve: `Inox/research/inox-remote-serve.md`, `Inox/research/inox-session-packets.md`
- [Fractanet mesh — Tailscale and SSH](fractanet-mesh.md) — tailnet, SSH aliases, capable-host reachability
- [fractavolta.com DNS zone](fractavolta-dns.md) — Gandi zone, `fracta` A record, service CNAMEs

## Access

From a trusted workstation:

```bash
ssh fracta
```

`fracta` is a **local SSH alias** (not a hostname published in this doc). The node is
part of the **trust perimeter**: configuration and credentials may be placed on the
machine when required for production, the same way as a `.env` on a developer laptop.
Routine deployment and maintenance scripts should also use `ssh fracta`, not public
DNS such as `ssh fractavolta.com`. Public SSH is break-glass or bootstrap only.

## Trust model

| Layer | Trusted for secrets? | Versioned in GitHub? |
|-------|-------------------|----------------------|
| Trusted workstation (`ssh fracta` from) | Yes (operator) | No |
| fracta VPS filesystem | Yes (runtime) | **Never** for secret values |
| GitHub (any repo) | Public or leak-prone | Names and docs only |
| Operium repo | Method and references | Secret **references**, not values |

**Rule:** API keys, service role tokens, and bearer secrets live on fracta (or a
password manager), referenced by path or id in Operium. They must **not** be committed,
pushed, or pasted into issues or PRs.

This is consistent with [Public / private split](public-private-split.md): even the
private operational registry stores `stored_in: password-manager` or
`stored_in: /srv/cogentia/secrets/guide.env`, not the secret body.

## Public role of fracta

fracta exposes a **governed public Cogentia face** (~1 GB RAM VPS):

```text
Internet
  -> DNS: *.fractavolta.com CNAME fracta.fractavolta.com -> 82.70.234.207 (OCI)
  -> Caddy (cogentia.fractavolta.com, other vhosts — see fractavolta-dns.md)
  -> mcp-cogentia.service (127.0.0.1:8791)  Guide MCP HTTP
  -> cogentia.service (127.0.0.1:8790)        Cogentia daemon
```

Magistral / model-router stays **loopback-only**. The MCP adapter is the public
retrieval and chat boundary for visitors.

## Secrets file on the node

Runtime secrets for the Guide MCP are loaded from:

```text
/srv/cogentia/secrets/guide.env
```

Observed permissions model (required for MCP user `ubuntu`):

```bash
chown root:ubuntu /srv/cogentia/secrets/guide.env
chmod 640 /srv/cogentia/secrets/guide.env
```

`cogentia-mcp-http.js` loads this via `COGENTIA_GUIDE_ENV_FILE` (or the default
search order documented in `cogentia/docs/cogentia-magistral-boundary.md`).

**Do not** copy `guide.env` into `cogentia/`, `operium/`, or any GitHub repo.
Update it only on the VPS (or via `ssh fracta` from a trusted machine).

## Secret-safe inspection protocol

The abstract rule is defined by Cogentia's
[Secret-safe operational inspection](https://github.com/JeanHuguesRobert/cogentia/blob/main/docs/secret-safe-inspection.md):
inspect secret metadata and behavior, not secret values.

On fracta, routine diagnostics must therefore report only:

- file path, owner, group and permissions;
- whether the variable is configured;
- whether the file is inside or tracked by a Git worktree;
- service references and authorized scope;
- success or failure of a bounded authenticated probe.

Do not use unredacted `systemctl cat`, `systemctl show --property=Environment`,
`env`, `printenv`, `/proc/<pid>/environ`, or `cat` on secret files in diagnostics
whose output leaves the host.

Safe examples:

```bash
# Location and permissions only
stat -c '%n owner=%U group=%G mode=%a' /srv/cogentia/secrets/guide.env

# Presence only
grep -q '^COGENTIA_GUIDE_WEB_SEARCH_API_KEY=' /srv/cogentia/secrets/guide.env \
  && echo configured || echo missing

# Unit paths and env-file references only
systemctl show mcp-cogentia.service \
  --property=EnvironmentFiles \
  --property=FragmentPath \
  --property=DropInPaths
```

Systemd drop-ins must reference an external secret file:

```ini
[Service]
EnvironmentFile=/srv/cogentia/secrets/ona-proxy.env
```

They must not embed literal bearer values with `Environment=TOKEN=value`.
Use `root:ubuntu` plus mode `0640` when the runtime user needs documented file
access, or `root:root` plus mode `0600` when systemd alone loads the file before
dropping privileges. Verify the chosen model on the actual service manager.

If a value is printed into a controlled transcript, record that precise fact;
do not claim compromise without evidence of unauthorized observation or use.

### Variable names (values only on fracta)

Document **names** in git; set **values** on the node.

| Variable | Role |
|----------|------|
| `COGENTIA_GUIDE_BATCH` | `1` = batch retrieval per Guide turn |
| `COGENTIA_RETRIEVAL_BACKEND` | `supabase` = direct regional retrieval (Phase 1) |
| `SUPABASE_URL` | Supabase project URL (when backend=supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (when backend=supabase) |
| `OPENAI_API_KEY` | Query embeddings for hybrid/semantic (when on fracta) |
| `COGENTIA_RETRIEVAL_CORPUS_KEY` | e.g. `cogentia-public` |
| `COGENTIA_INOX_RETRIEVAL_URL` | Base URL of remote `inox-serve` (Phase 4) |
| `COGENTIA_INOX_SERVE_TOKEN` | Bearer token for `inox-serve` (if required) |
| `COGENTIA_GUIDE_WEB_SEARCH_API_KEY` | Optional Brave/web search |

When `COGENTIA_INOX_RETRIEVAL_URL` is set, the Guide prefers **`inox-session`**
(`POST /session/turn`, `inox.session.v1`) over direct Supabase on fracta — see
`cogentia/scripts/lib/retrieval-inox-session.js`.

## Retrieval backends (evolution)

| Phase | fracta `guide.env` | Where heavy work runs |
|-------|-------------------|------------------------|
| 0 | Local daemon batch only | fracta SQLite + local vectors |
| 1 | `COGENTIA_RETRIEVAL_BACKEND=supabase` + Supabase/OpenAI keys on fracta | Supabase region + OpenAI from fracta |
| 4 (target) | `COGENTIA_INOX_RETRIEVAL_URL` → capable host; **remove** Supabase/OpenAI from fracta | `inox-serve` on capable host (inline secrets there) |

Phase 4 weak-node pattern:

```text
fracta Guide MCP  --HTTPS session/turn-->  inox-serve (capable host)
                                                  |
                                            Supabase + OpenAI (secrets on capable host only)
```

fracta may keep **only** `COGENTIA_INOX_RETRIEVAL_URL` and `COGENTIA_INOX_SERVE_TOKEN`
in `guide.env` — no `SUPABASE_SERVICE_ROLE_KEY` on the 1 GB VPS.

If `inox-serve` has no inline secrets, it emits **continuations**; fracta can fulfill
only if local keys exist (split-host mode). Production intent: capable host holds keys,
fracta sends mandates only.

## What fracta may hold vs must not

**May hold (trust perimeter):**

- `guide.env` and similar env files under `/srv/cogentia/secrets/`
- Corpus registry and index data under `/var/lib/cogentia/`
- Git mirrors under `/srv/cogentia/repos/`
- Loopback service configuration (systemd units referencing env files, never embedding literal secrets)

**Must not hold (prefer capable host or remove after Phase 4):**

- Long-term copy of Supabase service role on a small public VPS once Inox path is live
- Private registry exports, incident dumps with credentials
- Any secret committed to git

**Must never expose publicly:**

- Daemon admin routes, Magistral admin, raw `guide.env`, SSH beyond operator control

## Operator checklist

From a trusted workstation:

```bash
# Stack health (see cogentia/deploy/fracta/README.md)
ssh fracta 'sudo /srv/cogentia/repos/cogentia/scripts/ops/fracta-guide-stack.sh healthcheck'

# Guide retrieval backend (no secret values in output)
ssh fracta 'curl -fsS http://127.0.0.1:8791/health | jq .context.retrieval_backend, .context.inox_retrieval'

# After editing guide.env
ssh fracta 'sudo systemctl restart mcp-cogentia.service'
```

After `git pull` on `/srv/cogentia/repos/cogentia` and `/srv/cogentia/repos/Inox`:

```bash
ssh fracta 'sudo /srv/cogentia/repos/cogentia/scripts/ops/fracta-guide-stack.sh restart'
```

## Inox on a capable host (reference)

`inox-serve` is deployed **outside** fracta when fracta must stay weak. Its secrets
(Supabase, OpenAI) live in **that** host's environment — same trust rules: on-disk
env, not GitHub.

Document the capable host in the **private** Operium registry (host id, URL, rotation).
This public note only records the pattern.

## Related GitHub issues

- [cogentia#42](https://github.com/JeanHuguesRobert/cogentia/issues/42) — Phase 4 Inox mandat
- [Inox#23](https://github.com/JeanHuguesRobert/Inox/issues/23) — runtime VM reset (worker reuse)

## Changelog

| Date | Change |
|------|--------|
| 2026-07-03 | Initial note: trust perimeter, `guide.env`, Phase 4 `inox.session.v1` |
| 2026-07-04 | Cross-link to [fractanet-mesh.md](fractanet-mesh.md); `COGENTIA_INOX_RETRIEVAL_URL` live via Tailscale |
| 2026-07-04 | Cross-link to [fractavolta-dns.md](fractavolta-dns.md); public path diagram includes OCI IP |
