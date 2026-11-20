# Dynamic Hosted Browser Router — Operium #25

**Implementation status (20 Nov 2026):** source and fixture tests; localhost-only staging service on Fracta2. **Public Caddy is not switched over.** Do not claim live authenticated client or WebSocket acceptance from unit tests.

This lightweight Python HTTP/WebSocket adapter sits behind a *fixed* Caddy HTTPS reverse proxy. It authenticates Basic credentials against a private bcrypt registry; maps the exact authenticated login to a fixed loopback-only KasmVNC port; and forwards the same credentials to KasmVNC (whose own user needs matching credentials). No identity is inferred from a client header. Unauthenticated/unknown/disabled users fail closed. There is no default route to JHN.

Files: `core.py` strict registry and bcrypt verification, `server.py` HTTP/WS relay, `manage.py` atomic registry lifecycle, `init-live-registry.py` one-time import from deployed Caddy (never re-run if registry exists), `integration_fixture.py` isolated TLS+WS tests, `../test-hosted-router.py` unit fixtures. Runtime requires Python 3 + bcrypt; no package installs or new identity platform.

### Staging

On Fracta2, `/etc/operium/hosted-browser/router.json` is root-owned (`0640`, group `ubuntu`) and contains *only* bcrypt password hashes, login IDs, and fixed loopback ports. The service `hosted-browser-router.service` binds exclusively to `127.0.0.1:8768`. It is presently **not** the public frontend. Credentials and registry values are never published.

`python3 scripts/test-hosted-router.py -v` and `python3 scripts/hosted-router/integration_fixture.py -v` exercise exact mappings, unknown users, disable/enable, credential mismatches, fail-closed validation, HTTP proxy and WS Upgrade through a synthetic TLS backend. The test backend is deliberately not KasmVNC.

Manage with `sudo python3 .../manage.py list|disable LOGIN|enable LOGIN|rotate LOGIN --hash-file OWNER_PRIVATE_FILE|add LOGIN --id WORKSPACE_ID --port PORT --hash-file OWNER_PRIVATE_FILE`. All write actions replace the registry atomically. The Caddy configuration and service remain untouched. New users must still be provisioned as independent Unix/KasmVNC browser workspaces; a registry entry alone does not create the browser.

### Cutover guard

1. Verify **real** authenticated request and WebSocket to `127.0.0.1:8768` for JHN, Frédéric and Maguy using authorized local credential handling; check KasmVNC identity parity and `Origin` behavior. No credentials in logs, chats, Git or command transcripts.
2. Back up the existing Caddy browser vhost. Preserve `/.well-known/soma`, `/soma/*`, and `/api/cop/principal-consent/*` exception paths. Replace only the browser's Basic-auth and user-specific route with one stable `reverse_proxy 127.0.0.1:8768` route. Validate before reload.
3. Confirm public browser HTTP and WebSocket interactive sessions for each user and an unknown login (401). Restore backup immediately if a regression occurs. No browser, Unix account or KasmVNC profile deletion.
4. Create then revoke a fixture account by changing the registry only; show no Caddy source diff or reload and confirm immediate denial.

### Known restrictions

The HTTP relay now uses chunked streaming rather than buffering complete downloads; a synthetic 18 MiB response is tested. Registry writes are serialized using a local flock lock file. Validation is entirely in memory (no temporary credential-bearing validation file), and the atomic replacement preserves file owner and restrictive permissions. Duplicate login, workspace ID and upstream port are rejected. WebSocket backpressure, slow upstream handling and multi-process behavior need further operational testing. WebSocket handling uses a basic bidirectional relay, not a full RFC6455 parser. KasmVNC authentication semantics on the installed launcher (`SecurityTypes None`) still require a protocol-level review. Avoid open Internet binding and never treat a reachable localhost listener as proof of authenticated remote browser usability.

### Live acceptance still pending (20 November 2026)

Live KasmVNC stores are mode 0600, each owned by the corresponding hosted Unix account; production launcher still uses `-SecurityTypes None` alongside `-PasswordFile`. The distinction between public Basic login and local KasmVNC user must be reality-tested per existing account before cutover. A tool-safety refusal prevented an authenticated Maguy probe using the private secret, and is not evidence of router failure. Caddy retains the direct routes until authorized interactive end-to-end verification is possible.
