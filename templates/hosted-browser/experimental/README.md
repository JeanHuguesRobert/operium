# Experimental Hosted Browser CDP helpers

This directory contains **unreleased WIP**, not production tooling.

The file cdp-maximize-hosted-browser.js is the historical October 2026 prototype recovered from ThinkPad Operium stash c3a439cd90f3e4e7adf4bf5809dc3ddf3a8a228a, originally at templates/hosted-browser/cdp-maximize-hosted-browser.js.

**Owner:** [Operium #23](https://github.com/JeanHuguesRobert/operium/issues/23), with browser provisioning/authentication separately tracked in [#25](https://github.com/JeanHuguesRobert/operium/issues/25).

It attempts to use a local Chromium CDP endpoint to set a window's bounds and maximize it. The code was syntax-checked on Node 22 but has **not** been reality-tested against the current live browser. It has no automatic invocation and must never expose CDP publicly.

Before use: verify the selected CDP port, WebSocket availability, browser-window targeting, timeouts/error handling and current security boundary; add fixture tests and a real controlled browser test. Do not treat this WIP checkpoint as acceptance or authorization to deploy.
