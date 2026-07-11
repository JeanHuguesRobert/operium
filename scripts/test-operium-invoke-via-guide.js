#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildGuideActionRouteBody,
  invokeToolViaGuide,
  resolveActionRouteToken,
} from "../lib/invoke-tool.js";
import { shouldLogActionInvocations } from "../lib/node-agent/invocation-log.js";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-invoke-guide-"));
const dbPath = path.join(tmpDir, "node_memory.sqlite");

assert.equal(resolveActionRouteToken({ env: { COGENTIA_ACTION_ROUTE_TOKEN: "route-token" } }), "route-token");

const body = buildGuideActionRouteBody({
  capability: "dev.tools.shell",
  model: "shell-repl",
  prompt: "echo ROUTED_OK",
  repl: true,
  expect: "ROUTED_OK",
  sessionId: "sess-1",
});
assert.equal(body.model, "shell-repl");
assert.equal(body.capability, "dev.tools.shell");
assert.equal(body.repl, true);

let captured = null;
const mockFetch = async (url, options = {}) => {
  captured = { url, options };
  return {
    ok: true,
    status: 200,
    url,
    body: {
      ok: true,
      service: "cogentia-action-route",
      model: "shell-repl",
      content: "ROUTED_OK",
      session_id: "sess-1",
      route: {
        endpoint: "http://127.0.0.1:8793",
        attractor_id: "attractor:test:agent-cli-gateway",
        routed_via: "guide_blackboard",
        status: "online",
        fresh: true,
      },
    },
  };
};

const result = await invokeToolViaGuide({
  aggregatorUrl: "http://127.0.0.1:9999",
  capability: "dev.tools.shell",
  model: "shell-repl",
  prompt: "echo ROUTED_OK",
  repl: true,
  expect: "ROUTED_OK",
  env: { COGENTIA_ACTION_ROUTE_TOKEN: "route-token" },
  fetch: mockFetch,
});

assert.equal(result.ok, true);
assert.equal(result.via, "guide");
assert.equal(result.content, "ROUTED_OK");
assert.equal(result.route?.routed_via, "guide_blackboard");
assert.equal(captured.url, "http://127.0.0.1:9999/ops/route/action");
assert.equal(captured.options.method, "POST");
assert.match(captured.options.headers.Authorization, /Bearer route-token/);

const missingToken = await invokeToolViaGuide({
  aggregatorUrl: "http://127.0.0.1:9999",
  model: "shell-repl",
  prompt: "echo OK",
  env: {},
  fetch: mockFetch,
});
assert.equal(missingToken.ok, false);
assert.equal(missingToken.error, "missing_action_route_token");

assert.equal(shouldLogActionInvocations({ OPERIUM_LOG_ACTIONS: "1" }), true);
assert.equal(shouldLogActionInvocations({ OPERIUM_LOG_ACTIONS: "0" }), false);

const { db } = openNodeMemoryDb({
  dbPath,
  nodeId: "resource://invoke-test",
  hostname: "invoke-test",
  env: { COGENTIA_OPS_STATE_DIR: tmpDir, ONA_DB_PATH: dbPath },
});

await invokeToolViaGuide({
  aggregatorUrl: "http://127.0.0.1:9999",
  model: "shell-repl",
  prompt: "echo ROUTED_OK",
  env: {
    COGENTIA_ACTION_ROUTE_TOKEN: "route-token",
    OPERIUM_LOG_ACTIONS: "1",
    COGENTIA_OPS_STATE_DIR: tmpDir,
    ONA_DB_PATH: dbPath,
  },
  fetch: mockFetch,
});

const row = db.prepare(`
  SELECT plane, route, ok, summary
  FROM invocation_log
  ORDER BY invoked_at DESC
  LIMIT 1
`).get();
assert.equal(row.plane, "action");
assert.equal(row.route, "POST /ops/route/action");
assert.equal(row.ok, 1);
assert.match(row.summary, /routed_via=guide_blackboard/);

db.close();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  tests: [
    "buildGuideActionRouteBody",
    "invokeToolViaGuide",
    "missing_action_route_token",
    "invocation_log_when_enabled",
  ],
}, null, 2));