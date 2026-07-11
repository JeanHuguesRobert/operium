#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { loadOnaConfig } from "../lib/node-agent/config.js";
import { appendEventLog, openNodeMemoryDb } from "../lib/node-agent/db.js";
import { applyProbeCycle } from "../lib/node-agent/local-state.js";
import { createOnaHttpServer } from "../lib/node-agent/http-server.js";
import {
  exitCodeForNodeResult,
  fetchOnaEndpoint,
  resolveOnaUrl,
  runNodeCliCommand,
} from "../lib/node-cli.js";
import {
  formatNodeLogsHuman,
  formatNodeStatusHuman,
} from "../lib/format-node-human.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-node-cli-"));
const dbPath = path.join(tmpDir, "node_memory.sqlite");
const { db } = openNodeMemoryDb({
  dbPath,
  nodeId: "resource://cli-test",
  hostname: "cli-test",
});

const cycle = {
  probes: [
    { probe_kind: "ona", ok: true, skipped: false, target: "http://127.0.0.1:8794/health" },
    { probe_kind: "gateway", ok: true, skipped: false, target: "http://127.0.0.1:8793/health" },
  ],
  probed_at: new Date().toISOString(),
  resource_id: "resource://cli-test",
  catalogue_node: "cli-test",
};

applyProbeCycle(db, cycle, {
  catalogue: { ok: true, nodes: [{ hostname: "cli-test", resource_id: "resource://cli-test" }] },
  nodeId: "resource://cli-test",
  hostname: "cli-test",
});

appendEventLog(db, "ona.started", { ok: true });
appendEventLog(db, "ona.probe_cycle", { health_score: 4 });

const config = loadOnaConfig({
  ONA_COP_DELIVERY: "0",
  ONA_BIND: "127.0.0.1",
  ONA_HOSTNAME: "cli-test",
  ONA_NODE_ID: "resource://cli-test",
  ONA_READ_TOKEN: "cli-read-token",
});

const server = createOnaHttpServer({
  config,
  db,
  startedAt: new Date().toISOString(),
  getNodeId: () => "resource://cli-test",
  runProbe: async () => ({
    ok: true,
    identity: { node_id: "resource://cli-test", hostname: "cli-test" },
    summary: { health_score: 4, probe_count: 2, failed_count: 0 },
  }),
});

const port = await listenEphemeral(server);
const baseUrl = `http://127.0.0.1:${port}`;

assert.equal(resolveOnaUrl({ url: baseUrl }), baseUrl);

const status = await runNodeCliCommand({
  subcommand: "status",
  url: baseUrl,
  token: "cli-read-token",
});
assert.equal(status.ok, true);
assert.equal(status.body.schema, "operium.node.status.v1");
assert.equal(status.body.node_id, "resource://cli-test");
assert.equal(status.body.health_score, 3);
assert.equal(exitCodeForNodeResult(status, "status"), 1);

const peers = await runNodeCliCommand({
  subcommand: "peers",
  url: baseUrl,
  token: "cli-read-token",
  fresh: true,
});
assert.equal(peers.ok, true);
assert.equal(peers.body.schema, "operium.node.peers.v1");
assert.equal(peers.body.fresh_only, true);

const logs = await runNodeCliCommand({
  subcommand: "logs",
  url: baseUrl,
  token: "cli-read-token",
  logKind: "ona.started",
  logLimit: 5,
});
assert.equal(logs.ok, true);
assert.equal(logs.body.schema, "operium.node.logs.v1");
assert.equal(logs.body.count, 1);
assert.equal(logs.body.events[0].kind, "ona.started");

const denied = await fetchOnaEndpoint("/node/status", {
  url: baseUrl,
  token: "wrong-token",
});
assert.equal(denied.ok, false);
assert.equal(denied.status, 401);

const humanStatus = formatNodeStatusHuman(status.body);
assert.match(humanStatus, /Operium Node Agent/);
assert.match(humanStatus, /cli-test/);

const humanLogs = formatNodeLogsHuman(logs.body);
assert.match(humanLogs, /ona\.started/);

db.close();
await new Promise((resolve) => server.close(resolve));
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  tests: [
    "runNodeCliCommand_status",
    "runNodeCliCommand_peers",
    "runNodeCliCommand_logs",
    "fetchOnaEndpoint_auth",
    "formatNodeStatusHuman",
    "formatNodeLogsHuman",
    "exitCodeForNodeResult",
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