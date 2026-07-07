---
title: "Serra corpus integration plan"
description: "Operational plan for integrating the Serra repository into the Cogentia corpus without exposing unstable WIP or sensitive local material."
layout: default
date: 2026-07-07
last_modified_at: 2026-07-07
license: Apache-2.0
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/research/serra-corpus-integration-plan.md
document_role: "operational"
document_kind: "integration-plan"
visibility: "public"
lifecycle_state: "active"
status: "planning"
---

# Serra corpus integration plan

Serra should become part of the Cogentia corpus, but not by directly importing the
current working tree. The repository is useful to the corpus because it explores
AI-mediated interfaces, adaptive dashboards, reactive computation and operational
control surfaces. It is also currently a large work in progress with local
secret-like files and many unreviewed code changes.

The safe integration path is therefore staged:

```text
audit Serra locally
  -> remove or ignore sensitive local files
  -> stabilize public documentation
  -> define corpus metadata
  -> add Serra to the registry
  -> rebuild and verify the corpus index
```

## Why Serra belongs in the corpus

Serra adds a practical interface layer to the corpus:

- AI-first interaction model: text or voice intent becomes suggested actions and
  dynamic interface state.
- Reactive dashboard model: elements, formulas and state propagation make an
  operational surface that can adapt to context.
- Possible Fractanet role: a governed dashboard/control plane for nodes,
  services, jobs and context gateways.
- Possible Cogentia role: a visible front-end experiment for corpus navigation,
  context packs, continuations and operational state.

This makes Serra relevant as a public repository if its public surface is
cleaned up and its sensitive local state is kept out of Git and out of public
indexing.

## Current blockers

The local repository should be treated as unsafe for direct corpus import until
these blockers are resolved:

- Large dirty working tree with many modified, deleted and untracked files.
- Secret-like local files are present in the worktree.
- Generated or build output appears mixed with source changes.
- Documentation exists, but the canonical public reading path is not yet clear.
- Corpus metadata is not present in the canonical registry.
- Public/private visibility for network, auth, MCP and operational docs has not
  been reviewed.

Do not index or expose local-only files from this state. Only committed public
Git content should become part of the default public corpus view.

## Proposed corpus classification

Initial classification:

| Field | Proposed value |
|-------|----------------|
| Repository | `JeanHuguesRobert/serra` |
| Corpus role | `interface-system` or `operational-ui` |
| Document role | mixed: `source`, `operational`, `reference` |
| Visibility | public repository, public view only after review |
| Public presence | `full` after cleanup, otherwise `stub` |
| Primary entry point | `README.md` |
| Secondary entry points | `docs/ARCHITECTURE.md`, `docs/MCP.md`, `docs/NETWORK.md`, `knowledge.md` |

Serra should not be marked as a private repository, but it should be integrated
under the same boundary rule as every other corpus member:

```text
public Git repository != every local file is public
public repository != every document is safe to expose without review
```

## Work plan

### Phase 1 - Local safety audit

- Inspect `git status --short --branch`.
- Identify secret-like paths and ensure they are ignored or removed from the
  worktree before any commit.
- Check `.gitignore` for environment files, private keys, certificates, local
  databases, generated assets and dependency directories.
- Separate generated/build output from source changes.
- Decide whether the current WIP should be saved on a WIP branch before cleanup.

Acceptance criteria:

- No secret-like local file is staged.
- Public commits contain only source, docs and intentional config templates.
- The repository can be inspected by an agent without encountering local secret
  values.

### Phase 2 - Public documentation cleanup

- Update `README.md` to describe what Serra is today, not only what it aims to
  become.
- Add or refresh a concise public architecture map.
- Decide whether `knowledge.md` remains a public source document or becomes an
  internal working note.
- Add frontmatter to important Markdown documents if Cogentia metadata is
  expected to classify them deterministically.
- Add a short `docs/index.md` or equivalent navigation page if the current docs
  are too flat.

Acceptance criteria:

- A human or agent can answer "what is Serra?" from the first two public links.
- The public reading path does not require GitHub file-tree exploration.
- Sensitive operational details are absent or clearly redacted.

### Phase 3 - Registry integration

- Add Serra to the canonical corpus registry.
- Use relative repository paths in the registry.
- Set the public navigation fields deliberately:
  - `start_here`: `README.md`
  - `public_index`: `README.md` or `docs/index.md`
  - `canonical_reading_path`: README plus selected docs
- If cleanup is incomplete, add Serra as a public stub first instead of a full
  public corpus member.

Acceptance criteria:

- `node scripts/cogentia.js corpus verify --json` accepts the registry entry.
- `node scripts/cogentia.js index update --json` indexes only intended public
  Markdown documents by default.
- Public search results do not reveal local paths or local-only files.

### Phase 4 - Corpus navigation

- Add Serra to corpus status and public navigation generated views through
  Cogentia, not by hand-editing generated files.
- Link Serra from the most relevant conceptual trails:
  - Cogentia Commons and context gateway.
  - Operium operational UI and control surfaces.
  - Fractanet node supervision.
  - MCP / agent interface experiments.

Acceptance criteria:

- Humans can navigate from the public corpus entry page to Serra.
- Agents can retrieve Serra context through the index and context gateway.
- There is no public-to-private link from Serra's public view.

## Suggested GitHub issue

Open the tracking issue in `JeanHuguesRobert/cogentia`, because the integration
work changes the corpus registry, public navigation and index behavior. Keep the
issue implementation-neutral and link back to this plan.

Suggested title:

```text
Integrate Serra into the Cogentia corpus
```

Suggested checklist:

- [ ] Audit Serra local WIP and secret-like paths.
- [ ] Ensure `.gitignore` covers local secrets and generated outputs.
- [ ] Stabilize Serra public README and documentation map.
- [ ] Decide public stub vs full public corpus presence.
- [ ] Add Serra to the canonical corpus registry.
- [ ] Run corpus verify and index update.
- [ ] Check public context search for Serra results.
- [ ] Update or regenerate public navigation views.

## Do not do yet

- Do not import the local dirty worktree into the public corpus.
- Do not expose local paths, environment files, private keys, certificates or
  deployment-specific network material.
- Do not let Cogentia make semantic visibility judgments silently.
- Do not treat the SQLite index as canonical evidence of Serra's state.

Git and reviewed Markdown remain canonical. The index is only a reconstructible
cache after Serra has been made safe to index.
