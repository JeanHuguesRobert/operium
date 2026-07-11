#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import {
  buildNodePeers,
  isAcceptablePeerEndpoint,
  isAttractorFresh,
  normalizePeerAttractor,
  selectPeerAttractors,
  syncPeersFromBlackboard,
} from "../lib/node-agent/peer-sync.js";
import { runTtlSweeper } from "../lib/node-agent/ttl-sweeper.js";
import { createOnaHttpServer } from "../lib/node-agent/http-server.js";
import { loadOnaConfig } from "../lib/node-agent/config.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-ona-peers-"));
const dbPath = path.join(tmpDir, "node_memory.sqlite");
const { db } = openNodeMemoryDb({
  dbPath,
  nodeId: "resource://fracta",
  hostname: "fracta",
});

const now = new Date();
const freshAt = new Date(now.getTime() - 60_000).toISOString();
const staleAt = new Date(now.getTime() - 600_000).toISOString();

assert.equal(isAcceptablePeerEndpoint("http://100.122.121.68:8794"), true);
assert.equal(isAcceptablePeerEndpoint("secret://ona"), false);
assert.equal(isAcceptablePeerEndpoint("http://100.122.121.68:8793"), false);

const thinkpadAttractor = {
  id: "attractor:i7-thinkpad-jhr:operium-node",
  node: { resource_id: "resource://i7-thinkpad-jhr", hostname: "i7-thinkpad-jhr" },
  matches: { capabilities: ["operium.node.v1"] },
  availability: { status: "online", last_seen: freshAt, ttl_seconds: 300 },
  transport: { profile: "operium.node.v1", endpoint_ref: "http://100.122.121.68:8794" },
  metadata: { ona_version: "0.1.0", health_score: 4 },
};

assert.equal(isAttractorFresh(thinkpadAttractor, now), true);

const normalized = normalizePeerAttractor(thinkpadAttractor, now);
assert.equal(normalized.ok, true);
assert.equal(normalized.peer.hostname, "i7-thinkpad-jhr");

const attractors = [
  thinkpadAttractor,
  {
    id: "attractor:fracta:operium-node",
    node: { resource_id: "resource://fracta", hostname: "fracta" },
    matches: { capabilities: ["operium.node.v1"] },
    availability: { status: "online", last_seen: freshAt, ttl_seconds: 300 },
    transport: { profile: "operium.node.v1", endpoint_ref: "http://100.91.12.74:8794" },
  },
  {
    id: "attractor:stale:operium-node",
    node: { resource_id: "resource://stale", hostname: "stale" },
    matches: { capabilities: ["operium.node.v1"] },
    availability: { status: "degraded", last_seen: staleAt, ttl_seconds: 300 },
    transport: { profile: "operium.node.v1", endpoint_ref: "http://10.0.0.9:8794" },
  },
  {
    id: "attractor:bad-endpoint:operium-node",
    matches: { capabilities: ["operium.node.v1"] },
    availability: { status: "online", last_seen: freshAt, ttl_seconds: 300 },
    transport: { profile: "operium.node.v1", endpoint_ref: "secret://bad" },
  },
];

const peers = selectPeerAttractors(attractors, {
  selfAttractorId: "attractor:fracta:operium-node",
  fresh: true,
  now,
});
assert.equal(peers.length, 1);
assert.equal(peers[0].hostname, "i7-thinkpad-jhr");

const allPeers = selectPeerAttractors(attractors, {
  selfAttractorId: "attractor:fracta:operium-node",
  fresh: false,
  now,
});
assert.equal(allPeers.length, 2);

const blackboardServer = http.createServer((req, res) => {
  const payload = JSON.stringify({
    ok: true,
    snapshot_at: now.toISOString(),
    count: attractors.length,
    attractors,
  });
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(payload);
});

await new Promise((resolve) => blackboardServer.listen(0, "127.0.0.1", resolve));
const blackboardPort = blackboardServer.address().port;

const sync = await syncPeersFromBlackboard(db, {
  blackboardUrl: `http://127.0.0.1:${blackboardPort}`,
  nodeId: "resource://fracta",
  selfAttractorId: "attractor:fracta:operium-node",
  fresh: true,
  now,
});
assert.equal(sync.ok, true);
assert.equal(sync.peer_count, 1);

const local = db.prepare("SELECT last_blackboard_sync_at FROM local_state WHERE node_id = ?")
  .get("resource://fracta");
assert.ok(local?.last_blackboard_sync_at);

const peersBody = buildNodePeers({
  config: { nodeId: "resource://fracta" },
  db,
  nodeId: "resource://fracta",
  fresh: true,
});
assert.equal(peersBody.schema, "operium.node.peers.v1");
assert.equal(peersBody.count, 1);

db.prepare(`
  INSERT INTO probe_history (
    id, probe_kind, target, ok, latency_ms, result_json, probed_at, expires_at
  ) VALUES ('probe:old', 'self', 'http://127.0.0.1:8794/health', 1, 1, '{}', ?, ?)
`).run(
  new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
  new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
);

const sweep = runTtlSweeper(db, { now });
assert.ok(sweep.total_removed >= 1);

const config = loadOnaConfig({
  ONA_COP_DELIVERY: "0",
  ONA_BIND: "127.0.0.1",
  ONA_READ_TOKEN: "read-test-token",
});
const apiServer = createOnaHttpServer({
  config,
  db,
  startedAt: new Date().toISOString(),
  getNodeId: () => "resource://fracta",
});
await new Promise((resolve) => apiServer.listen(0, "127.0.0.1", resolve));
const apiPort = apiServer.address().port;

const httpPeers = await fetchJson(`http://127.0.0.1:${apiPort}/node/peers?fresh=1`, {
  Authorization: "Bearer read-test-token",
});
assert.equal(httpPeers.schema, "operium.node.peers.v1");
assert.equal(httpPeers.fresh_only, true);

db.close();
await new Promise((resolve) => blackboardServer.close(resolve));
await new Promise((resolve) => apiServer.close(resolve));
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  tests: [
    "endpoint_filter",
    "selectPeerAttractors",
    "syncPeersFromBlackboard",
    "buildNodePeers",
    "ttlSweeper",
    "node_peers_http",
  ],
}, null, 2));

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, (res) => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body || "{}"));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}