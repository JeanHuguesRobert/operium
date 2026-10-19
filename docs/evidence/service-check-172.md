---
title: "Bounded service checks for ONA and the public Guide"
date: "2026-10-19"
document_role: operational
document_kind: evidence
visibility: public
lifecycle_state: active
---

# Service-check grant evidence

The Principal selected on-demand health checks for ONA on Fracta and the public
Guide on Fracta2. The signed grant was scoped to those two catalogue entries and
request issue [Inseme #173](https://github.com/JeanHuguesRobert/inseme/issues/173),
with a seven-day expiry, twenty checks total and at least sixty seconds between
checks. The private signing key was generated in memory and was not persisted.

The first ONA request (`service172-ona-1`) timed out because the synchronous
worker blocked the event loop serving its own health endpoint. That failed check
spent one unit and its receipt was retained. Commit
[`6a4660e`](https://github.com/JeanHuguesRobert/operium/commit/6a4660e4e4ecf4953a06c8395c848e69e1b0c3d7)
moved service probes into a bounded child process. After the authorized ONA-only
restart to activate that correction, ONA remained active and returned HTTP 200
with `reported_healthy` for `service172-ona-2`.

The public Guide request (`service172-guide-1`) returned HTTP 200 with
`reported_healthy`. Both successful receipts were delivered to #173 and verified:
[ONA receipt](https://github.com/JeanHuguesRobert/inseme/issues/173#issuecomment-6255912193)
and [Guide receipt](https://github.com/JeanHuguesRobert/inseme/issues/173#issuecomment-6255947487).
The original ONA request is also preserved at
[its receipt](https://github.com/JeanHuguesRobert/inseme/issues/173#issuecomment-6255695752),
which records the timeout.

A cold replay of the Guide request on 2026-10-19 recovered the same completed
receipt and provider execution ID. It caused no additional provider execution;
the recorded callback remained verified. At that observation, the grant was
enabled, three of the original twenty checks had been spent (the two successful
checks plus the retained timeout), and seventeen remained. The grant expires at
`2026-10-25T22:02:04.136Z`.

These probes establish endpoint reachability and the health status declared by
each endpoint only. The Guide response supplied no version or revision, and
neither check verifies a deployed revision or a functional conversational
journey. No mobile-provider operation was requested or performed. The ONA
policy and scheduled job remain available only within the signed scope and
expire under that grant; the retained event store preserves all three receipts.
