#!/usr/bin/env node
// Historical experimental WIP recovered from ThinkPad stash c3a439cd (2026-10).
// Issue: JeanHuguesRobert/operium#23. UNTESTED against live Chromium; not deployed.
// CDP must remain loopback-only. No authentication or privilege is conferred here.
function fail(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

async function main() {
  const port = String(process.argv[2] || process.env.HOSTED_BROWSER_CDP_PORT || "9223").replace(/[^\d]/g, "");
  if (!port) fail(64, "cdp port required");
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(r => {
    if (!r.ok) throw new Error(`cdp_http_${r.status}`);
    return r.json();
  }).catch(err => fail(2, `cdp_unavailable ${err.message}`));
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  const page = pages.find(p => p.type === "page") || pages[0];
  if (!page) fail(3, "cdp_no_target");
  const url = version.webSocketDebuggerUrl;
  if (!url) fail(3, "cdp_no_websocket");

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const send = (method, params) => {
      const n = ++id;
      ws.send(JSON.stringify({ id: n, method, params }));
      return new Promise((res, rej) => pending.set(n, { res, rej }));
    };
    ws.addEventListener("message", ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result || {});
      }
    });
    ws.addEventListener("error", ev => reject(ev.error || new Error("cdp_ws_error")));
    ws.addEventListener("open", async () => {
      try {
        const win = await send("Browser.getWindowForTarget", { targetId: page.id });
        process.stdout.write(`before ${JSON.stringify(win)}\n`);
        await send("Browser.setWindowBounds", {
          windowId: win.windowId,
          bounds: { windowState: "normal", left: 0, top: 0, width: 1920, height: 1080 },
        });
        await send("Browser.setWindowBounds", {
          windowId: win.windowId,
          bounds: { windowState: "maximized" },
        });
        const after = await send("Browser.getWindowForTarget", { targetId: page.id });
        process.stdout.write(`after ${JSON.stringify(after)}\n`);
        ws.close();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }).catch(err => fail(4, err.message));
}

main().catch(err => fail(1, err.message || String(err)));
