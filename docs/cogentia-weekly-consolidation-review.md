---
title: Cogentia weekly consolidation scheduling review
author: unknown
affiliation: Institut Mariani / C.O.R.S.I.C.A., 1 cours Paoli, F-20250 Corte, Corsica
date: '2026-10-24'
status: working-paper
license: CC BY-SA 4.0
language: en
document_role: operational
document_kind: scheduling-review
visibility: public
lifecycle_state: working
update_policy: UP-DEFAULT-REVIEWED
canonical_url: https://github.com/JeanHuguesRobert/operium/blob/main/docs/cogentia-weekly-consolidation-review.md
provenance:
  origin_type: repository
  origin_repository: JeanHuguesRobert/cogentia
  origin_ref: e86547c881919210f809baa143d7f8e1515a1d21
  origin_date: '2026-10-24'
  derived_from:
    - https://github.com/JeanHuguesRobert/cogentia/blob/e86547c881919210f809baa143d7f8e1515a1d21/systemd/cogentia-consolidation.service
    - https://github.com/JeanHuguesRobert/cogentia/blob/e86547c881919210f809baa143d7f8e1515a1d21/systemd/cogentia-consolidation.timer
    - https://github.com/JeanHuguesRobert/cogentia/blob/e86547c881919210f809baa143d7f8e1515a1d21/deploy/fracta/calendar/cop-wake.corpus-consolidation.json
review:
  status: unreviewed
  reviewed_by: []
---

# Cogentia weekly consolidation scheduling review

## Observed versioned state

The source timer requests Sunday at 04:00 UTC with persistent catch-up. Its
service fragment invokes `corpus consolidate`, which is not a supported CLI
subcommand. Cogentia correction `e86547c881919210f809baa143d7f8e1515a1d21`
is committed and pushed; it changes the command to
`consolidate --weekly --no-fan-out`. The weekly run generates local artifacts
without updating sibling projections, committing, pushing, deploying or
automatically converging the corpus.

The separate COP wake descriptor requests a seven-day interval and declares
`authorized: false`. This is a versioned candidate, not evidence of an active
or authorized schedule. Do not enable both trigger paths without resolving
duplicate execution and ownership.

The weekly completion guard previously tested only the public digest. That
could hide an interrupted run missing private artifacts or completion state.
The prepared correction checks material outputs and a completed weekly packet;
fixture tests cover repetition without writes, partial recovery and forcing.

## Limits of this review

On Fracta, both `cogentia-consolidation.service` and
`cogentia-consolidation.timer` were absent (`LoadState=not-found`); there was no
last or next trigger. The COP wake descriptor remains `authorized: false` and
is not active. The Cogentia checkout there was 180 commits behind `origin/main`
with 14 pre-existing dirty source files. These facts establish that no systemd
weekly schedule was active on that host, but do not explain why earlier weekly
reports stopped. No service had been installed at the time of this inspection.

## Next operational step

Use Fracta's versioned systemd timer and leave the COP wake path disabled.
Install the exact pushed Cogentia release in an isolated directory, run the
service once, validate the current-week completion packet and both privacy
digests, then enable the timer and record its next trigger. The deployment
script refuses to replace existing units or overwrite a dirty weekly output
and captures the pre-existing checkout diff for recovery.

For recovery, restore the previous installed unit from an inspected backup and
restore its previous enabled/disabled state; do not guess that state from the
source template. Preserve the attempted run's logs and typed outcome.

Related: [Cogentia implementation boundary](https://github.com/JeanHuguesRobert/cogentia/blob/main/docs/sunday-consolidation-master-plan.md)
and [Operium calendar](fracta-calendar.md).
