---
document_role: "operational"
document_kind: "documentation"
visibility: "public"
lifecycle_state: "active"
classification_source: "cogentia.js"
classification_version: "1"
classification_rule: "documentation"
classification_confidence: "medium"
---

# Navigation assistant local hold (ONA)

The hosted navigation-assistant **gateway** on fracta2 already accepts the
hosted extension before any assistant joins (`:8776`, loopback + Tailscale).
The same hold runs on the workstation inside **Operium Node Agent** so the
local unpacked extension stays connected while the TUI is down.

## Why ONA

ONA is already the always-on process on `resource://i7-thinkpad-jhr`
(`OperiumNodeAgent`, `:8794`). Cogentia owns the relay
(`scripts/ops/navigation-assistant-gateway.js`). ONA imports that module from
the sibling checkout (`resolveCogentiaRoot` / `OPERIUM_COGENTIA_ROOT`) and
listens on **loopback only** `127.0.0.1:8765`.

This is not a second protocol. The TUI connects as an assistant
(`ws://127.0.0.1:8765/assistant`) when the hold is up, and otherwise falls
back to serving `:8765` itself.

## Bind and fail-open

| Item | Value |
|------|--------|
| Host | `127.0.0.1` only |
| Port | `8765` (`ONA_NAV_ASSIST_GATEWAY_PORT` / `NAV_ASSIST_PORT`) |
| Disable | `ONA_NAV_ASSIST_GATEWAY=0` |
| Occupied port | retry every 10 s (`EADDRINUSE`); do not crash ONA |

Do not publish `8765` on Tailscale or the public Internet. The hosted
instance remains the fracta2 systemd unit on `8776`.

## Operator sequence

1. ONA holds `:8765` (or retries until the previous TUI-as-server exits).
2. Local Brave extension connects to `ws://127.0.0.1:8765/ws` and waits.
3. The TUI joins `/assistant` (local) and `ws://fracta2:8776/assistant` (hosted).
4. Keys `[l]` / `[h]` choose which extension receives RPC.

Verify without secrets:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
Invoke-RestMethod http://fracta2:8776/health
```

Expect `extensionConnected` true with `assistants` 0 while the TUI is down,
then `assistants` ≥ 1 after the TUI starts.
