#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { attachNavigationAssistantGateway } from "../lib/node-agent/navigation-gateway.js";
import { createNavigationGateway } from "../../cogentia/scripts/ops/navigation-assistant-gateway.js";
import { resolveCogentiaRoot } from "../lib/paths.js";

const { WebSocket } = createRequire(path.join(resolveCogentiaRoot(), "package.json"))("ws");

const disabled = await attachNavigationAssistantGateway({
  env: { ONA_NAV_ASSIST_GATEWAY: "0" },
});
assert.equal(disabled.skipped, true);
assert.equal(disabled.reason, "disabled");

const missing = await attachNavigationAssistantGateway({
  env: { ONA_NAV_ASSIST_GATEWAY: "1" },
  resolveCogentiaRoot: () => null,
});
assert.equal(missing.skipped, true);
assert.equal(missing.reason, "cogentia_root_missing");

const blocker = http.createServer();
await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
const busyPort = blocker.address().port;
const deferred = await attachNavigationAssistantGateway({
  createNavigationGateway,
  port: busyPort,
  retryMs: 20,
  env: { ONA_NAV_ASSIST_GATEWAY: "1", ONA_HOSTNAME: "test-ona" },
});
assert.equal(deferred.skipped, false);
assert.equal(deferred.deferred, true);
assert.equal(deferred.reason, "eaddrinuse");
await deferred.stop();
await new Promise((resolve) => blocker.close(resolve));

const live = await attachNavigationAssistantGateway({
  createNavigationGateway,
  port: 0,
  env: { ONA_NAV_ASSIST_GATEWAY: "1", ONA_HOSTNAME: "test-ona" },
});
assert.equal(live.listening, true);
const port = live.gateway._bound[0].address().port;
const health = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json());
assert.equal(health.ok, true);
assert.equal(health.instance, "test-ona");
assert.equal(health.extensionConnected, false);
assert.equal(health.assistants, 0);

const extension = await new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/extension`);
  ws.once("open", () => resolve(ws));
  ws.once("error", reject);
});
const held = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json());
assert.equal(held.extensionConnected, true);
assert.equal(held.assistants, 0);

const assistant = await new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/assistant`);
  ws.once("message", (data) => resolve({ ws, hello: JSON.parse(data.toString()) }));
  ws.once("error", reject);
});
assert.equal(assistant.hello.type, "gateway.hello");
assert.equal(assistant.hello.extensionConnected, true);

extension.close();
assistant.ws.close();
await live.stop();

console.log("ona navigation-assistant gateway attach: ok");
