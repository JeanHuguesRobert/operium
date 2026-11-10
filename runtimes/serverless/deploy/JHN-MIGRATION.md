# JHN migration: FractaFunction staged integration and controlled cutover

## Verified locally on Fracta2 (2026-11-10)

- The built JHN SPA (`apps/platform/dist`) serves `/cop/consent/:id` with the
  updated ratification UI without a Netlify rebuild.
- One Node.js facade (`127.0.0.1:8795`) dispatches to one *real* legacy Node
  Netlify PDF function, the canonical COP consent listener (`127.0.0.1:8796`)
  and one Deno worker (`127.0.0.1:8797`), by an exact route manifest.
- The real Deno territorial-context function returns `400` for missing Corsica
  coordinates, without external calls.
- Canonical COP returns `401` with no bearer and `403` with an invalid bearer.
  The facade preserves these results; the original Netlify proxy did not
  preserve the backend `401` in the same way.
- No real Principal Supabase browser session, signed COP decision or public
  domain cutover was performed. The three mandates and approval journal were
  not modified.

## Operator stage: requires pre-existing SSH/sudo owner access

```bash
ssh -tt fracta2 'sudo python3 /srv/cogentia/repos/operium/runtimes/serverless/deploy/install-jhn-fractafunction-preview.py --apply'
```

Without `--apply`, the script prints the anticipated changes and does not
modify systemd. With `--apply`, it installs and starts **only** two loopback
systemd services; performs a 200/400/401 smoke test; rolls back newly installed
units on any failure. It modifies no Caddy, DNS, COP mandate or decision
configuration. The Deno runtime has no blanket filesystem/process permissions.

## Inspect the preview from the owner's workstation

```powershell
ssh -L 8795:127.0.0.1:8795 fracta2
```

With that SSH session open, inspect `http://127.0.0.1:8795/cop/consent/<UUID>`
using a *test challenge reference only*. The preview uses its own localhost
browser origin; Supabase login, redirects and approval **cannot be claimed
validated** on this URL. The protected backend still verifies bearer tokens
and canonical origin; no COP grant is implied by the preview.

## Cutover dependencies and explicit acceptance

1. Confirm the correct versioned SPA and manifest are actually installed.
2. Inventory and migrate or explicitly disable all public JHN API routes not
   yet provided here. **Current manifest covers only the canonical COP consent
   relay, PDF and territorial context.** `nasa-control` and `interactions-desk` (authenticated reads not yet proven),
   `chat-stream`, `/api/jhn-cop-events`, GitHub webhook, `/api/oleole/*`,
   `artifact-access/*` are **not production migrated**. Their API paths must
   fail closed; silent SPA fallback is prohibited.
3. Review secrets and authentication per route, especially Supabase service
   role usage and user-bound authority. Confirm that Caddy restores the public
   HTTPS origin. The local preview uses a canonical-origin Request internally,
   but this is **not** proof of authenticated production-browser behavior.
4. Prepare TLS certificate provisioning and DNS migration; inspect Caddy
   fragment `jhn-caddy-cutover.caddy` and confirm no conflicting virtual host.
5. After an explicitly authorized cutover, test real user login, anonymous
   refusal, a valid read-only challenge and an invalid challenge; do not
   activate decision recording until the authorized approval protocol is
   intentionally enabled. Record all effect receipts and rollback points.
6. Roll back the DNS to Netlify and remove the new virtual host if regression
   fails, keeping the canonical COP journal intact.

The Caddy cutover fragment is deliberately **not installed** or loaded.
Promoting the site before migrating its remaining APIs would break existing
features, even though the specific COP static page works locally.

## 2026-11-10 route migration ledger (post-pilot)

The deployed Netlify profile still owns the public hostname; the following
statuses refer to the **local FractaFunction JHN preview**, not the production
DNS route.

| Route | Local preview | Required before public cutover |
|---|---|---|
| `/cop/consent/:id` SPA | Static frontend 200 | Real Supabase browser login on canonical HTTPS origin |
| `/api/cop/principal-consent/*` | Canonical local COP relay, anonymous 401, bad bearer 403 | Valid authenticated read, origin/CORS and explicit decision authorization |
| `/cc/requete-conseil-constitutionnel-haute-corse-2026.pdf` | Existing Node handler, POST 405 | GET upstream PDF bytes, cache and correct content type |
| `/api/corsica/context` | Existing Deno handler, invalid parameters 400 | Valid coordinate Open-Meteo fetch, rate limits and attribution |
| `/api/chat-stream` | Existing Deno handler health 200; POST 503 **by design** | Secret vault, COP event ingress, provider and streaming semantics |
| `/api/nasa/control` | Existing Deno source handler, unauthenticated 401; writes blocked 405 | Principal/delegate Vault configuration and authenticated read end-to-end |
| `/api/interactions/desk` | Existing Deno source handler, unauthenticated 401; writes blocked 405 | Supabase owner/delegate Vault configuration and scoped authenticated reads |
| `/api/jhn-cop-events` | Explicit 503 not migrated | Instance vault, capability checks and append-only events |
| `/api/webhooks/github` | Explicit 503 not migrated | GitHub HMAC signature, delivery dedupe and durable events |
| `/api/oleole/*` | Explicit 503 not migrated | Presence actor identity, state and storage privileges |
| `/artifact-access/*` | Explicit 503 not migrated | Bounded token access and service-role RPCs |

The `GET /api/chat-stream?healthcheck=true` response only demonstrates that
the original handler was invoked. It is **not** evidence that POST chat
or the COP event pipeline can execute. The service's explicit 503 is the
intentional authorization/dependency boundary until required validation.

The next engineering package should focus on **Node/Deno configuration and
instance Vault adapters** under already scoped authorities; it must never
create fake keys, transfer service-role secrets into a generic environment,
or silently enable consequential APIs. Preserve the separate authority between
COP capabilities, the technical transport and user consent.

## 2026-11-10 protected-read and streaming continuation

NASA Control and Interactions Desk are now routed to their **original Deno
source handlers**, through an explicit **GET-only** guard. Their anonymous
GET requests return 401 and POST/PATCH requests are rejected 405, before any
Vault or Supabase interaction. These guards do not claim valid-bearer access
works: the runtime still has no configured JHN instance Vault or service-role
client. If either is unavailable, the underlying handler is expected to fail
closed. The effects/mutations remain unavailable.

The shared Node facade now uses streaming response forwarding instead of
buffering all response bytes before sending them. The test suite includes
a synthetic `text/event-stream` response. Production chat POST remains
explicitly disabled; the streaming fix is a prerequisite, not evidence of
chat availability.

Verified using a real Node-to-Deno HTTP integration: anonymous NASA/Desk
GET=401, both POST=405, chat health GET=200, territorial context invalid
GET=400. No public DNS, Caddy or canonical COP decision was changed.

## 2026-11-10 Supabase bootstrap / instance Vault connection

The **existing** Inseme instance configuration machinery is now reachable
from FractaFunction Deno on Fracta2, without a second Vault implementation.
The canonical code is:

- `inseme/packages/cop-host/src/config/instanceConfig.edge.js` — Netlify.env
  first, Deno.env fallback; client factory and `loadInstanceConfig()`;
- `inseme/packages/cop-host/src/config/instanceConfig.core.js` —
  `instance_config`, `instances`, `instance_aliases`, instance cache;
- `inseme/packages/cop-host/src/config/instanceConfig.backend.js` — Node
  `process.env` provider with equivalent initialization;
- `inseme/.env` — existing local bootstrap, private mode 0600.

`bootstrap-jhn-deno.js` uses existing Inseme dotenv parsing to read exactly
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` from that
private file, checks the HTTPS endpoint, and launches the Deno worker using
an allowlisted environment. It passes no OpenAI, COP or GitHub secret directly
from the `.env` file. The original Deno module resolves Vault values itself.
The source file is *not copied* and the bootstrap variables never enter
GitHub or standard application logs. The wrapper restricts network access to
the configured Supabase endpoint, its module CDNs, the local listener and the
Open-Meteo API. All unknown routes still fail closed.

`deno.json` maps `@inseme/cop-host/` onto the already checked-out, canonical
Inseme package, so the unchanged Edge code can import its config provider.
The worker's systemd unit starts through this wrapper; it uses a private
runtime cache directory. Remote Deno module downloads may recur after
restarts until the module cache is provisioned persistently.

**Read-only evidence on Fracta2:**

- Original loader successfully fetched **123** config rows from the actual
  Supabase instance (no values emitted in the probe receipt).
- `jhn_cop_capability` and `openai_api_key`: present in Vault.
- `nasa_principal_subject`, `nasa_operator_subjects`, and
  `interactions_desk_principal_subject`: absent under these names.
- `jhn_cop_event_url`: absent; its original chat code falls back to the
  public `/api/jhn-cop-events`, which is not migrated.
- Running the real Deno worker with this bootstrap, both protected NASA and
  Interactions GETs return `401 invalid_session` with a deliberately invalid
  bearer, and `401 missing_bearer_token` without a bearer. **No authorized
  user read or write has been tested.**

The probe may be repeated from an already authorized operator shell:

```sh
cd /srv/cogentia/repos/operium
node runtimes/serverless/bootstrap-jhn-deno.js --probe
```

It prints only configuration row counts and booleans for selected key
presence. Its output is *not* an authority grant and cannot prove the presence
of principal/delegate mapping when a key is missing. The service-role bootstrap
key is powerful: do not use the Deno worker as a general multi-tenant function
execution host. Dedicated workers and restricted ingress will remain required
for the owner-private routes and secrets.

**Cutover remains blocked** pending authenticated owner/delegate reads,
review of the owner subject configuration, COP event ingress migration and
full public API parity.

## 2026-11-10 COP-event route and instance-alias verification

The existing `inseme/apps/platform/netlify/edge-functions/jhn-cop-events.js`
handler can now be dispatched by the Deno host on `/api/jhn-cop-events`.
FractaFunction wraps it with an **off-by-default event-write gate**:

- `GET` responds `405 method_not_allowed`.
- `POST` responds `503 cop_event_ingress_not_activated` unless the *operator*
  deliberately provisions `FRACTAFUNCTION_COP_EVENT_WRITES=enabled` together
  with the corresponding runtime environment permission. That operator setting
  is not installed or authorized by this change.
- When activated in a future migration, the original handler must independently
  verify the Vault capability, payload shape and Supabase append RPC. This
  source-level gate does not confer COP authority or validate a real write.
- The original chat POST remains disabled. Do **not** enable chat merely
  because the event route exists; the replay/idempotency, provider effects and
  owner-approved ingress semantics must first be reviewed.

Actual Fracta2 HTTP integration returned `405` on GET, `503` on a test POST,
with **no COP event written**. Both test processes were stopped afterwards.

The JHN instance alias hierarchy was also inspected **without printing values**:
`jhn` and `john` resolve to existing instance aliases. In the instance-level
key inventory, `nasa_principal_subject` is present, but its effective value
resolved by `getConfig(..., 'jhn')` is empty. The `nasa_operator_subjects` and
`interactions_desk_principal_subject` keys are absent. Thus the NASA principal
read blocker is **not just a root-table lookup limitation**. Any future
configuration change must use the canonical instance config editing workflow,
with an actual owner identity established through Supabase authentication;
never fabricate a principal UUID, delegate or grant for staging.

The diagnostic `probe-jhn-vault.ts` now returns only key-presence and
nonempty-result booleans for root, `jhn` and `john`. It does not reveal values.
