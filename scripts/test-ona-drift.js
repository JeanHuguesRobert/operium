#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { loadOnaConfig } from "../lib/node-agent/config.js";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import { applyProbeCycle } from "../lib/node-agent/local-state.js";
import { handleCopHttpRequest } from "../lib/node-agent/cop-handler.js";
import { deliverCopOutbox } from "../lib/node-agent/cop-deliverer.js";
import { enqueueCopOutbox } from "../lib/node-agent/cop-store.js";
import { COP_NODE_PACKETS } from "../lib/node-agent/envelope.js";
import { createOnaHttpServer } from "../lib/node-agent/http-server.js";
import { buildNodeDrift, computeNodeDrift } from "../lib/node-agent/drift.js";
import {
  buildNodeSnapshot,
  readCachedPeerSnapshot,
  upsertPeerSnapshot,
} from "../lib/node-agent/snapshot.js";
import { upsertPeerNodes } from "../lib/node-agent/peer-sync.js";
import {
  fetchFreshPeerSnapshot,
  readPeerSnapshotFromCache,
  runNodeSnapshotCommand,
} from "../lib/node-cli.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-ona-drift-"));
const dbPath = path.join(tmpDir, "node_memory.sqlite");
const registryPath = path.join(tmpDir, "resources.yaml");

fs.writeFileSync(registryPath, `
version: 1
nodes:
  - resource_id: resource://cli-test
    hostname: cli-test
    capabilities: [agent.cli.gateway, inox-serve]
    transport:
      local_url: http://127.0.0.1:8792
    secrets:
      - id: missing-secret
        stored_in: ${path.join(tmpDir, "missing-secret.txt").replace(/\\/g, "/")}
`);

const { db } = openNodeMemoryDb({
  dbPath,
  nodeId: "resource://cli-test",
  hostname: "cli-test",
});

const failedCycle = {
  probes: [
    { probe_kind: "ona", ok: true, skipped: false, target: "http://127.0.0.1:8794/health" },
    { probe_kind: "gateway", ok: false, skipped: false, target: "http://127.0.0.1:8793/health" },
    { probe_kind: "inox", ok: false, skipped: false, target: "http://127.0.0.1:8792/health" },
  ],
  probed_at: new Date().toISOString(),
  resource_id: "resource://cli-test",
  catalogue_node: "cli-test",
};

applyProbeCycle(db, failedCycle, {
  catalogue: { ok: true, nodes: [{ hostname: "cli-test", resource_id: "resource://cli-test" }] },
  nodeId: "resource://cli-test",
  hostname: "cli-test",
});

const config = loadOnaConfig({
  ONA_COP_DELIVERY: "0",
  ONA_BIND: "127.0.0.1",
  ONA_HOSTNAME: "cli-test",
  ONA_NODE_ID: "resource://cli-test",
  ONA_READ_TOKEN: "read-token",
  OPERIUM_REGISTRY: registryPath,
  COGENTIA_BLACKBOARD_URL: "https://cogentia.fractavolta.com/ops/blackboard",
});

const deps = {
  config,
  db,
  startedAt: new Date().toISOString(),
  nodeId: "resource://cli-test",
};

const snapshot = buildNodeSnapshot(deps);
assert.equal(snapshot.schema, "operium.node.snapshot.v1");
assert.equal(snapshot.node_id, "resource://cli-test");
assert.equal(snapshot.status.schema, "operium.node.status.v1");
assert.ok(Array.isArray(snapshot.peers));
assert.equal(snapshot.probe_history.length, 3);

const driftItems = computeNodeDrift(deps);
assert.ok(driftItems.some(item => item.kind === "secret_ref_missing"));
assert.ok(driftItems.some(item => item.kind === "local_service_down"));
assert.ok(driftItems.some(item => item.kind === "blackboard_stale"));

const drift = buildNodeDrift(deps);
assert.equal(drift.schema, "operium.node.drift.v1");
assert.ok(Array.isArray(drift.next_actions));
assert.ok(drift.next_actions.length >= 1);

const copSnapshot = await handleCopHttpRequest({
  id: "cop:snapshot-1",
  packet_type: COP_NODE_PACKETS.SNAPSHOT,
  sender: { node_id: "resource://fracta" },
  payload: {},
}, deps);
assert.equal(copSnapshot.status, 200);
assert.equal(
  copSnapshot.body.response_envelope.payload.schema,
  "operium.node.snapshot.v1",
);

const localSnapshot = buildNodeSnapshot(deps);
const stored = upsertPeerSnapshot(db, localSnapshot);
assert.equal(stored.ok, true);

const cached = readCachedPeerSnapshot(db, "resource://cli-test");
assert.equal(cached.ok, true);
assert.equal(cached.snapshot.node_id, "resource://cli-test");

const cacheCli = readPeerSnapshotFromCache({
  peerNodeId: "resource://cli-test",
  env: { ...process.env, COGENTIA_OPS_STATE_DIR: tmpDir, ONA_DB_PATH: dbPath },
});
assert.equal(cacheCli.ok, true);
assert.equal(cacheCli.body.cached, true);

const missingCache = readPeerSnapshotFromCache({
  peerNodeId: "resource://missing-peer",
  env: { ...process.env, COGENTIA_OPS_STATE_DIR: tmpDir, ONA_DB_PATH: dbPath },
});
assert.equal(missingCache.ok, false);
assert.equal(missingCache.error, "no_cached_snapshot");

const server = createOnaHttpServer({
  config,
  db,
  startedAt: deps.startedAt,
  getNodeId: () => "resource://cli-test",
});

const port = await listenEphemeral(server);
const httpSnapshot = await requestJson(`http://127.0.0.1:${port}/node/snapshot`, {
  headers: { Authorization: "Bearer read-token" },
});
assert.equal(httpSnapshot.schema, "operium.node.snapshot.v1");

const httpDrift = await requestJson(`http://127.0.0.1:${port}/node/drift`, {
  headers: { Authorization: "Bearer read-token" },
});
assert.equal(httpDrift.schema, "operium.node.drift.v1");
assert.ok(httpDrift.drift.length >= 1);

const httpCliSnapshot = await runNodeSnapshotCommand({
  subcommand: "snapshot",
  url: `http://127.0.0.1:${port}`,
  token: "read-token",
});
assert.equal(httpCliSnapshot.ok, true);
assert.equal(httpCliSnapshot.body.schema, "operium.node.snapshot.v1");

const peerServer = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/node/cop") {
    const peerSnapshot = buildNodeSnapshot({
      config: {
        ...config,
        hostname: "peer-host",
        nodeId: "resource://peer-host",
      },
      db,
      startedAt: deps.startedAt,
      nodeId: "resource://peer-host",
    });
    peerSnapshot.node_id = "resource://peer-host";
    peerSnapshot.hostname = "peer-host";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      packet_type: COP_NODE_PACKETS.SNAPSHOT,
      response_envelope: {
        payload: peerSnapshot,
      },
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});
const peerPort = await listenEphemeral(peerServer);

upsertPeerNodes(db, [{
  attractor_id: "attractor:peer-host:operium-node",
  node_id: "resource://peer-host",
  hostname: "peer-host",
  endpoint: `http://127.0.0.1:${peerPort}`,
  capabilities: "[]",
  status: "online",
  last_seen: new Date().toISOString(),
  ttl_seconds: 300,
  fresh: 1,
  updated_at: new Date().toISOString(),
}]);

const freshConfig = loadOnaConfig({
  ONA_COP_DELIVERY: "1",
  ONA_BIND: "127.0.0.1",
  ONA_HOSTNAME: "cli-test",
  ONA_NODE_ID: "resource://cli-test",
  ONA_PEER_TOKEN: "peer-token",
  OPERIUM_REGISTRY: registryPath,
  COGENTIA_OPS_STATE_DIR: tmpDir,
  ONA_DB_PATH: dbPath,
});

enqueueCopOutbox(db, {
  id: "out:snapshot-fresh",
  packet_type: COP_NODE_PACKETS.SNAPSHOT,
  sender: { node_id: "resource://cli-test" },
  recipient: { node_id: "resource://peer-host" },
  payload: {},
}, { targetNodeId: "resource://peer-host" });

const delivery = await deliverCopOutbox(db, { token: "peer-token", timeoutMs: 5000 });
assert.equal(delivery.delivered, 1);

const freshCached = readCachedPeerSnapshot(db, "resource://peer-host");
assert.equal(freshCached.ok, true);
assert.equal(freshCached.snapshot.node_id, "resource://peer-host");

const freshCli = await fetchFreshPeerSnapshot({
  peerNodeId: "resource://peer-host",
  env: {
    ONA_COP_DELIVERY: "1",
    ONA_PEER_TOKEN: "peer-token",
    ONA_HOSTNAME: "cli-test",
    ONA_NODE_ID: "resource://cli-test",
    COGENTIA_OPS_STATE_DIR: tmpDir,
    ONA_DB_PATH: dbPath,
    OPERIUM_REGISTRY: registryPath,
  },
  timeoutMs: 5000,
});
assert.equal(freshCli.ok, true);
assert.equal(freshCli.body.node_id, "resource://peer-host");

db.close();
await new Promise((resolve) => server.close(resolve));
await new Promise((resolve) => peerServer.close(resolve));
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  tests: [
    "buildNodeSnapshot",
    "computeNodeDrift",
    "buildNodeDrift",
    "cop_snapshot_handler",
    "peer_snapshot_cache",
    "node_snapshot_http",
    "node_drift_http",
    "snapshot_cli_http",
    "cop_snapshot_delivery",
    "fetchFreshPeerSnapshot",
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
          resolve(JSON.parse(body || "{}"));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.end(options.body || "");
  });
}