#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { loadOnaConfig } from "../lib/node-agent/config.js";
import { appendEventLog, openNodeMemoryDb } from "../lib/node-agent/db.js";
import { createOnaHttpServer } from "../lib/node-agent/http-server.js";
import { handleNodeProbe } from "../lib/node-agent/probe-route.js";
import { buildNodeLogs } from "../lib/node-agent/logs-route.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-ona-probe-"));
const dbPath = path.join(tmpDir, "node_memory.sqlite");
const { db } = openNodeMemoryDb({
  dbPath,
  nodeId: "resource://test-node",
  hostname: "test-node",
});

appendEventLog(db, "ona.started", { ok: true });
appendEventLog(db, "ona.probe_cycle", { health_score: 4 });
appendEventLog(db, "blackboard.sync_failed", { attempts: 3 });

const config = loadOnaConfig({
  ONA_COP_DELIVERY: "0",
  ONA_BIND: "127.0.0.1",
  ONA_HOSTNAME: "test-node",
  ONA_NODE_ID: "resource://test-node",
  ONA_READ_TOKEN: "read-token",
  ONA_ADMIN_TOKEN: "admin-token",
});

let probeCalls = 0;
const runProbe = async () => {
  probeCalls += 1;
  return {
    ok: true,
    identity: { node_id: "resource://test-node", hostname: "test-node" },
    summary: { health_score: 4, probe_count: 4, failed_count: 0 },
    peer_sync: { ok: false, error: "skipped" },
    ttl_sweep: { total_removed: 0 },
    cop_delivery: null,
  };
};

const direct = await handleNodeProbe({
  config,
  db,
  nodeId: "resource://test-node",
  runProbe,
});
assert.equal(direct.status, 200);
assert.equal(direct.body.schema, "operium.node.probe.v1");
assert.equal(direct.body.health_score, 4);
assert.equal(probeCalls, 1);

const unavailable = await handleNodeProbe({ config, db, nodeId: "resource://test-node" });
assert.equal(unavailable.status, 503);
assert.equal(unavailable.body.error, "probe_unavailable");

const logs = buildNodeLogs({ config, db, nodeId: "resource://test-node" }, { limit: "2" });
assert.equal(logs.schema, "operium.node.logs.v1");
assert.equal(logs.count, 2);
assert.ok(logs.events.every(event => event.kind && event.logged_at));

const filtered = buildNodeLogs(
  { config, db, nodeId: "resource://test-node" },
  { kind: "ona.probe_cycle" },
);
assert.equal(filtered.count, 1);
assert.equal(filtered.events[0].kind, "ona.probe_cycle");

const server = createOnaHttpServer({
  config,
  db,
  startedAt: new Date().toISOString(),
  getNodeId: () => "resource://test-node",
  runProbe,
});

const port = await listenEphemeral(server);

const logsHttp = await requestJson(`http://127.0.0.1:${port}/node/logs?limit=3`, {
  headers: { Authorization: "Bearer read-token" },
});
assert.equal(logsHttp.schema, "operium.node.logs.v1");
assert.equal(logsHttp.count, 3);

const logsDenied = await requestJson(`http://127.0.0.1:${port}/node/logs`, {
  expectStatus: 401,
});
assert.equal(logsDenied.error, "unauthorized");

const probeHttp = await requestJson(`http://127.0.0.1:${port}/node/probe`, {
  method: "POST",
  headers: { Authorization: "Bearer admin-token" },
});
assert.equal(probeHttp.schema, "operium.node.probe.v1");
assert.equal(probeHttp.ok, true);
assert.equal(probeCalls, 2);

const probeDenied = await requestJson(`http://127.0.0.1:${port}/node/probe`, {
  method: "POST",
  headers: { Authorization: "Bearer read-token" },
  expectStatus: 401,
});
assert.equal(probeDenied.error, "unauthorized_admin");

db.close();
await new Promise((resolve) => server.close(resolve));
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  tests: [
    "handleNodeProbe",
    "buildNodeLogs",
    "node_logs_http",
    "node_probe_http",
  ],
}, null, 2));

function listenEphemeral(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("invalid_listen_address"));
        return;
      }
      resolve(address.port);
    });
    server.on("error", reject);
  });
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: options.headers || {},
    }, (res) => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(body || "{}");
          if (options.expectStatus && res.statusCode !== options.expectStatus) {
            reject(new Error(`expected_status_${options.expectStatus}_got_${res.statusCode}`));
            return;
          }
          resolve(json);
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.end(options.body || "");
  });
}