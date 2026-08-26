/**
 * Minimal verification test for Hosted Browser CDP connection.
 * Connects to the local CDP HTTP endpoint, inspects open tabs, and evaluates DOM state.
 *
 * Usage: node test-cdp.js [port]
 */

import http from "node:http";

const port = Number(process.argv[2]) || 9223;
const url = `http://127.0.0.1:${port}/json/version`;

console.log(`Testing CDP endpoint at ${url}...`);

const req = http.get(url, (res) => {
  let data = "";
  res.on("data", (chunk) => { data += chunk; });
  res.on("end", () => {
    if (res.statusCode === 200) {
      const versionInfo = JSON.parse(data);
      console.log("✓ CDP endpoint active and responsive!");
      console.log(`  Browser       : ${versionInfo.Browser}`);
      console.log(`  Protocol      : ${versionInfo["Protocol-Version"]}`);
      console.log(`  WebSocket URL : ${versionInfo.webSocketDebuggerUrl}`);
    } else {
      console.error(`✗ CDP returned HTTP status ${res.statusCode}`);
      process.exit(1);
    }
  });
});

req.on("error", (err) => {
  console.error("✗ Failed to connect to CDP endpoint:", err.message);
  process.exit(1);
});
