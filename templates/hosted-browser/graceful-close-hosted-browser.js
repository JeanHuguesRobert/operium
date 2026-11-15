#!/usr/bin/env node
// Ask Chromium/Brave to quit via CDP Browser.close so the profile records
// a normal exit. SIGTERM looks like a crash to the profile.
// --mark-clean PROFILE writes exit_type=Normal after the process is gone.

function fail(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function markClean(profileDir) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  if (!profileDir) fail(64, "profile dir required");
  const files = [
    path.join(profileDir, "Local State"),
    path.join(profileDir, "Default", "Preferences"),
  ];
  for (const file of files) {
    let raw;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      process.stderr.write(`mark_clean_parse ${file}: ${err.message}\n`);
      continue;
    }
    if (!data.profile || typeof data.profile !== "object") data.profile = {};
    data.profile.exit_type = "Normal";
    data.profile.exited_cleanly = true;
    if (data.user_experience_metrics && typeof data.user_experience_metrics === "object") {
      if (!data.user_experience_metrics.stability || typeof data.user_experience_metrics.stability !== "object") {
        data.user_experience_metrics.stability = {};
      }
      data.user_experience_metrics.stability.exited_cleanly = true;
    }
    await fs.writeFile(file, JSON.stringify(data));
    process.stderr.write(`mark_clean ${file}\n`);
  }
}

async function cdpVersion(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error(`cdp_http_${response.status}`);
  return response.json();
}

async function waitCdpDown(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await cdpVersion(port);
    } catch {
      return true;
    }
    await sleep(150);
  }
  return false;
}

async function closeBrowser(port, timeoutMs) {
  const version = await cdpVersion(port).catch(err => fail(2, `cdp_unavailable ${err.message}`));
  const url = version.webSocketDebuggerUrl;
  if (!url) fail(3, "cdp_no_websocket");

  await new Promise((resolve, reject) => {
    let ws;
    const timer = setTimeout(() => {
      try { ws?.close(); } catch { /* ignore */ }
      reject(new Error("cdp_close_timeout"));
    }, timeoutMs);
    const done = err => {
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

  if (!await waitCdpDown(port, timeoutMs)) fail(4, "cdp_still_up");
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--mark-clean") {
    await markClean(args[1] || process.env.HOSTED_BROWSER_PROFILE_DIR || "");
    return;
  }
  const port = String(args[0] || process.env.HOSTED_BROWSER_CDP_PORT || "9223").replace(/[^\d]/g, "");
  const timeoutMs = Number(process.env.HOSTED_BROWSER_CLOSE_TIMEOUT_MS || 12000);
  if (!port) fail(64, "cdp port required");
  await closeBrowser(port, timeoutMs);
}

main().catch(err => fail(1, err.message || String(err)));
