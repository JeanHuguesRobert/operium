#!/usr/bin/env node
// Ask Chromium/Brave to quit via CDP Browser.close so the profile records
// a normal exit. SIGTERM looks like a crash to the profile.

const port = String(process.argv[2] || process.env.HOSTED_BROWSER_CDP_PORT || "9223").replace(/[^\d]/g, "");
const timeoutMs = Number(process.env.HOSTED_BROWSER_CLOSE_TIMEOUT_MS || 8000);

function fail(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

if (!port) fail(64, "cdp port required");

const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(r => {
  if (!r.ok) throw new Error(`cdp_http_${r.status}`);
  return r.json();
}).catch(err => fail(2, `cdp_unavailable ${err.message}`));

const url = version.webSocketDebuggerUrl;
if (!url) fail(3, "cdp_no_websocket");

await new Promise((resolve, reject) => {
  let ws;
  const timer = setTimeout(() => {
    try { ws?.close(); } catch { /* ignore */ }
    reject(new Error("cdp_close_timeout"));
  }, timeoutMs);
  const done = (err) => {
    clearTimeout(timer);
    try { ws?.close(); } catch { /* ignore */ }
    if (err) reject(err);
    else resolve();
  };
  ws = new WebSocket(url);
  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ id: 1, method: "Browser.close" }));
  });
  ws.addEventListener("message", () => done());
  ws.addEventListener("close", () => done());
  ws.addEventListener("error", event => done(event.error || new Error("cdp_ws_error")));
}).catch(err => fail(4, err.message));
