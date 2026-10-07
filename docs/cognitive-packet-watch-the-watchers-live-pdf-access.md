# Cognitive Packet — Watch the Watchers live PDF access

## Resume this packet

Repository target: `JeanHuguesRobert/operium`

Minimal command:

```text
resume this packet
```

Handler selection is external to this document. The Principal chooses the coding / operations handler.

## Status

**Resumable Cognitive Packet / live-server implementation + Reality Test.**

A real external probe on 2026-10-07 showed:

```text
GET https://jhn.baronsmariani.org/artifact-access/a/WTWRealityTest20261007ServerCheck01
→ generic site 404
→ no Watch the Watchers landing
```

The synthetic token was successfully registered in the existing Supabase Watch the Watchers database, and the relevant RPCs exist.

Therefore the observed failure is currently localized **before the datastore**, at the live HTTP routing / deployed-server layer.

# 1. Principal intent

The individualized URLs are not cosmetic aliases. They implement **Watch the Watchers**:

```text
one immutable PDF
        ↑
many individualized opaque URLs
        ↑
one URL per institutional path / recipient
        ↓
record which access path was used
        ↓
LANDING / OPEN_PDF / REDIRECT
```

The trace establishes that a particular **access path** was solicited. It MUST NOT be described as proof that a named human personally read the PDF.

All individualized URLs MUST ultimately resolve to the **same immutable canonical PDF bytes**.

# 2. Target hostname — verify before modifying

The Principal explicitly named `jhr.baronsmariani.org`.

Existing corpus/code frequently names `jhn.baronsmariani.org`.

Do not silently normalize this difference.

First determine, with live evidence:
1. whether `jhr.baronsmariani.org` exists;
2. whether it aliases or redirects elsewhere;
3. whether `jhn.baronsmariani.org` is the actual current public host;
4. which hostname is currently served by fracta/fracta2;
5. which hostname must appear in the final individualized filing URLs.

Record the conclusion before changing routing.

# 3. Existing components to reuse

Repository: `JeanHuguesRobert/inseme`

Existing handler:
```text
apps/platform/netlify/profiles/jhn/functions/artifact-access.js
```

Existing URL generator:
```text
scripts/watch-the-watchers-generate-url.js
```

Current semantics already implemented:
- opaque bearer token in public URL;
- hash token to `sha256:<hex>`;
- token lookup with `artifact_access_token_lookup`;
- reject unknown or disabled token;
- require matching `artifact_ref`;
- append conservative access events: `LANDING`, `OPEN_PDF`, `REDIRECT`;
- redirect to one configured artifact URL.

Do not rewrite these semantics from scratch unless a concrete incompatibility is demonstrated.

## Existing datastore

Supabase project:
```text
ndiysuhzmztatpxbkezn
```

Existing objects:
```text
artifact_access_tokens
artifact_access_events
artifact_access_token_register(...)
artifact_access_token_lookup(...)
artifact_access_event_append(...)
artifact_access_purge_expired(...)
```

Reuse this existing datastore/protocol unless a blocking defect is demonstrated. Never expose `SUPABASE_SERVICE_ROLE_KEY` publicly.

# 4. Existing Netlify assumption is not live truth

Source configuration in `inseme/apps/platform/netlify.toml` contains:

```text
/artifact-access/*
→ /.netlify/functions/artifact-access/:splat
```

but the real external probe returned the generic site 404.

Do not assume Netlify is the actual serving path merely because source code says so.

The Principal suspects the current site is a preview served through **fracta / fracta2**.

# 5. Infrastructure hypothesis to verify

Likely topology:

```text
Internet / Cloudflare
        ↓
fracta — Caddy edge
        ↓
Fractanet / Tailscale
        ↓
fracta2 — preview/origin
        ↓
current JHR/JHN site
```

This is a hypothesis until verified. Operium owns the live operational truth.

# 6. Goal

Make the real server behind the selected JHR/JHN hostname handle:

```text
GET  /artifact-access/a/<opaque-token>
POST /artifact-access/a/<opaque-token>/open
GET  /artifact-access/a/<opaque-token>/redirect
```

with Watch the Watchers semantics and durable Supabase traceability.

The final redirect target MUST be the **canonical immutable GitHub location of the frozen filing PDF**.

Do not substitute a REVIEW PDF, a mutable `main` URL, an ephemeral GitHub Actions artifact, or a temporary local file.

# 7. Canonical artifact invariant

```text
URL-VIDAL ------------------\
URL-PREFECTURE --------------\
URL-PREF-ELECTIONS -----------+--> SAME EXACT PDF BYTES
URL-CONSEIL-CONSTITUTIONNEL --/
URL-TA-BASTIA ---------------/
...
```

with one `artifact_ref`, one canonical immutable GitHub asset URL, one canonical SHA-256, many opaque access tokens, and many private recipient/context mappings.

The recipient identity MUST NOT be encoded in the public token.

# 8. Privacy and evidentiary semantics

Canonical event vocabulary remains:
```text
LANDING
OPEN_PDF
REDIRECT
```

Never manufacture:
```text
READ
PERSON_READ
RECIPIENT_READ
```

Do not collect raw IP address, browser fingerprint, advertising identifiers, cookies or local-storage identifiers unless a later separately authorized design explicitly changes the privacy model.

The access trace means: **this individualized path was requested**. It does not mean: **this named person read the document**.

# 9. Incremental implementation plan

## F0 — Observe live truth

No routing changes yet.

Determine and record:
- DNS for `jhr.baronsmariani.org`;
- DNS for `jhn.baronsmariani.org`;
- actual public serving edge;
- actual origin;
- whether fracta and/or fracta2 serves the preview;
- relevant Caddy vhost(s);
- current web root / upstream;
- whether any current route already proxies application endpoints;
- whether a small existing service can host the Watchers handler;
- whether the public site is static-only.

Acceptance:
```text
Internet request path
→ edge
→ origin
→ current site handler
```
must be concretely documented.

## F1 — Install the smallest live Watchers HTTP surface

Prefer adapting/reusing the existing `inseme` handler semantics.

Preference order:
1. reuse an existing Node HTTP service already present on fracta/fracta2;
2. deploy a narrowly scoped Watchers service on fracta2;
3. only if justified, introduce a new minimal service.

The service must:
- accept the three routes above;
- hash the opaque token before datastore lookup;
- call the existing Supabase RPCs;
- append events before redirecting;
- fail closed for unknown, expired, disabled or artifact-mismatched tokens;
- use `Cache-Control: no-store`;
- not leak recipient mappings;
- not expose service-role credentials.

## F2 — Route only the Watchers path

Modify actual Caddy routing so only `/artifact-access/*` is sent to the Watchers service.

Preserve the existing preview/static site for all unrelated paths.

Required non-regression examples:
```text
/
existing public pages
/contact
other known preview routes
```

## F3 — Canonical immutable GitHub target

Do not point production tokens to mutable `main`, ephemeral Actions artifacts, REVIEW PDF snapshots, or a temporary local file.

Wait until the filing process yields the exact immutable canonical GitHub URL and SHA-256.

Then configure:
```text
artifact_ref = <frozen filing identity>
canonical_target = <immutable GitHub URL>
sha256 = <exact 64-hex digest>
```

The service should identify the document as **FROZEN** rather than REVIEW.

## F4 — Reality Test

Use a synthetic token first.

### R1 — landing
```text
GET https://<selected-host>/artifact-access/a/<synthetic-token>
```
Expected: HTTP 200 landing, no generic SPA 404, exactly one corresponding `LANDING` event, private token mapping remains private.

### R2 — explicit open
Expected: `OPEN_PDF` appended, 303 redirect, target is the configured immutable GitHub PDF, downloaded bytes hash to configured SHA-256.

### R3 — redirect route
```text
GET /artifact-access/a/<synthetic-token>/redirect
```
Expected: `REDIRECT` appended, 302 to the exact same immutable PDF.

### R4 — unknown token
Expected: 404, no recipient disclosure, no access event.

### R5 — existing site regression
Verify existing public JHR/JHN pages still work.

## F5 — Filing URL factory readiness

Only after R1–R5 pass:
- repair/verify the private link factory;
- generate one opaque token per intended institutional path;
- ensure every generated token maps to the same frozen `artifact_ref`;
- do not publish bearer URLs in a public repository or public Issue;
- return bearer URLs only through the approved private surface.

Known current defect to verify/fix:
```text
JeanHuguesRobert/registre-mariani
.github/workflows/watchers-link-factory.yml
```
was observed pinning an `inseme` commit older than `scripts/watch-the-watchers-generate-url.js`.

Repair that as a separate bounded change if authorized; otherwise create a successor packet.

# 10. Result-oriented operations requirement

Expected negative conditions must be reported as typed results, not gratuitous red GitHub failures.

Examples:
```text
BLOCKED_DNS_UNKNOWN
BLOCKED_ORIGIN_UNREACHABLE
BLOCKED_CANONICAL_PDF_NOT_FROZEN
TOKEN_UNKNOWN
TOKEN_EXPIRED
ARTIFACT_MISMATCH
REALITY_TEST_FAILED
```

A GitHub workflow should be red only for genuine harness/infrastructure failure where a meaningful structured result could not be produced.

# 11. Secret-handling rule

Never print or commit:
- `SUPABASE_SERVICE_ROLE_KEY`;
- private token→recipient mappings;
- generated bearer URLs intended for real institutional recipients;
- private server credentials;
- unredacted environment dumps.

Safe evidence includes secret presence yes/no, service state, redacted config shape, token_ref hashes, synthetic test tokens, event counts, HTTP status, immutable PDF SHA-256, and public canonical target URL.

# 12. Effect ceiling

Allowed by this packet, once local authorization gates are satisfied:
- inspect live routing and origin state on fracta/fracta2;
- implement the smallest Watchers HTTP service needed;
- modify the relevant Caddy route for `/artifact-access/*`;
- add/update service unit/config if required;
- restart/reload only affected service(s);
- perform bounded external Reality Tests;
- update Operium operational evidence;
- make necessary code/config commits in the owning repository when authorized;
- post checkpoints and receipts.

Not authorized:
- sending filing emails;
- replacing Gmail placeholders with real institutional bearer URLs;
- filing the petition;
- publishing private recipient mappings;
- publishing the private filing package;
- changing unrelated JHR/JHN routes;
- changing unrelated DNS;
- broad restarts of fracta/fracta2;
- disabling security controls;
- treating a REVIEW artifact as frozen.

# 13. Stop conditions

Stop and report instead of improvising if:
- the live host differs materially from the documented hypothesis;
- the target hostname `jhr` vs `jhn` is unresolved;
- the canonical frozen PDF does not yet exist;
- the handler cannot safely access the required server;
- the proposed routing change would affect unrelated production surfaces;
- Supabase RPC semantics differ from the documented ones;
- a real recipient bearer URL would have to be exposed publicly;
- any secret would need to be copied into GitHub.

# 14. Deliverables

The handler should leave:
1. an F0 topology checkpoint;
2. implementation commit(s) or exact operational patch;
3. live routing receipt;
4. Reality Test evidence for R1–R5;
5. exact frozen artifact identity: canonical immutable GitHub URL, SHA-256, `artifact_ref`;
6. a statement whether the private URL factory is `READY` or `BLOCKED`;
7. successor packet(s) for anything intentionally out of scope.

# 15. Completion criterion

This packet is complete only when an external browser can use a synthetic individualized URL and the full path is observable:

```text
browser
→ selected jhr/jhn host
→ fracta/fracta2 routing
→ Watch the Watchers handler
→ Supabase token lookup
→ LANDING
→ explicit OPEN_PDF
→ immutable canonical GitHub PDF
→ SHA-256 match
```

and all existing unrelated site routes continue to work.

A successful unit test without this live Reality Test is not sufficient.
