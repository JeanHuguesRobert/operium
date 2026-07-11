#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { loadOnaConfig } from "../lib/node-agent/config.js";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import { handleCopHttpRequest } from "../lib/node-agent/cop-handler.js";
import { COP_NODE_PACKETS } from "../lib/node-agent/envelope.js";
import { enqueueCopOutbox } from "../lib/node-agent/cop-store.js";
import { upsertPeerNodes } from "../lib/node-agent/peer-sync.js";
import { deliverCopOutbox } from "../lib/node-agent/cop-deliverer.js";
import { createOnaHttpServer } from "../lib/node-agent/http-server.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-ona-cop-"));
const dbPath = path.join(tmpDir, "node_memory.sqlite");
const { db } = openNodeMemoryDb({
  dbPath,
  nodeId: "resource://fracta",
  hostname: "fracta",
});

const config = loadOnaConfig({
  ONA_COP_DELIVERY: "0",
  ONA_BIND: "127.0.0.1",
  ONA_HOSTNAME: "fracta",
  ONA_NODE_ID: "resource://fracta",
  ONA_PEER_TOKEN: "peer-token",
  ONA_ADMIN_TOKEN: "admin-token",
});

const deps = {
  config,
  db,
  startedAt: new Date().toISOString(),
  nodeId: "resource://fracta",
};

const statusResult = await handleCopHttpRequest({
  id: "cop:status-1",
  packet_type: COP_NODE_PACKETS.STATUS,
  sender: { node_id: "resource://i7-thinkpad-jhr" },
  payload: {},
}, deps);
assert.equal(statusResult.status, 200);
assert.equal(statusResult.body.response_envelope.payload.schema, "operium.node.status.v1");

const queryResult = await handleCopHttpRequest({
  id: "cop:query-1",
  packet_type: COP_NODE_PACKETS.QUERY,
  sender: { node_id: "resource://i7-thinkpad-jhr" },
  payload: { query: "peers", fresh: false },
}, deps);
assert.equal(queryResult.status, 200);
assert.equal(queryResult.body.response_envelope.payload.schema, "cop/node.query.result.v1");

const eventResult = await handleCopHttpRequest({
  id: "cop:event-1",
  packet_type: COP_NODE_PACKETS.EVENT,
  sender: { node_id: "resource://i7-thinkpad-jhr" },
  payload: { kind: "peer.test", detail: { ok: true } },
}, deps);
assert.equal(eventResult.status, 202);

const snapshotResult = await handleCopHttpRequest({
  id: "cop:snapshot-1",
  packet_type: COP_NODE_PACKETS.SNAPSHOT,
  sender: { node_id: "resource://i7-thinkpad-jhr" },
  payload: {},
}, deps);
assert.equal(snapshotResult.status, 200);
assert.equal(snapshotResult.body.response_envelope.payload.schema, "operium.node.snapshot.v1");

const unknownResult = await handleCopHttpRequest({
  id: "cop:unknown-1",
  packet_type: "cop/node.unknown.v1",
  sender: { node_id: "resource://i7-thinkpad-jhr" },
  payload: {},
}, deps);
assert.equal(unknownResult.status, 400);
assert.equal(unknownResult.body.error, "unknown_packet_type");

upsertPeerNodes(db, [{
  attractor_id: "attractor:i7-thinkpad-jhr:operium-node",
  node_id: "resource://i7-thinkpad-jhr",
  hostname: "i7-thinkpad-jhr",
  endpoint: "http://127.0.0.1:8795",
  capabilities: "[]",
  status: "online",
  last_seen: new Date().toISOString(),
  ttl_seconds: 300,
  fresh: 1,
  updated_at: new Date().toISOString(),
}]);

let deliveredBody = null;
const peerServer = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/node/cop") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    deliveredBody = JSON.parse(raw);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, accepted: true, packet_type: deliveredBody.packet_type }));
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise((resolve) => peerServer.listen(8795, "127.0.0.1", resolve));

const queued = enqueueCopOutbox(db, {
  id: "out:event-1",
  packet_type: COP_NODE_PACKETS.EVENT,
  sender: { node_id: "resource://fracta" },
  recipient: { node_id: "resource://i7-thinkpad-jhr" },
  payload: { kind: "delivery.test" },
}, { targetNodeId: "resource://i7-thinkpad-jhr" });
assert.equal(queued.ok, true);

const missingTarget = enqueueCopOutbox(db, {
  id: "out:bad-1",
  packet_type: COP_NODE_PACKETS.EVENT,
  sender: { node_id: "resource://fracta" },
  recipient: {},
  payload: {},
}, {});
assert.equal(missingTarget.ok, false);

const delivery = await deliverCopOutbox(db, {
  token: "peer-token",
  fetch: globalThis.fetch,
  timeoutMs: 5000,
});
assert.equal(delivery.ok, true);
assert.equal(delivery.delivered, 1);
assert.equal(deliveredBody.packet_type, COP_NODE_PACKETS.EVENT);

const apiServer = createOnaHttpServer({
  config,
  db,
  startedAt: deps.startedAt,
  getNodeId: () => "resource://fracta",
});
await new Promise((resolve) => apiServer.listen(0, "127.0.0.1", resolve));
const apiPort = apiServer.address().port;

const httpCop = await postJson(`http://127.0.0.1:${apiPort}/node/cop`, {
  id: "cop:http-1",
  packet_type: COP_NODE_PACKETS.QUERY,
  sender: { node_id: "resource://i7-thinkpad-jhr" },
  payload: { query: "event_log", limit: 5 },
}, { Authorization: "Bearer peer-token" });
assert.equal(httpCop.status, 200);
assert.equal(httpCop.body.ok, true);

const unauthorized = await postJson(`http://127.0.0.1:${apiPort}/node/cop`, {}, {});
assert.equal(unauthorized.status, 401);

db.close();
await new Promise((resolve) => peerServer.close(resolve));
await new Promise((resolve) => apiServer.close(resolve));
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  tests: [
    "cop_status_handler",
    "cop_query_handler",
    "cop_event_handler",
    "cop_snapshot_handler",
    "cop_unknown_400",
    "cop_outbox_delivery",
    "cop_http_route",
  ],
}, null, 2));

function postJson(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...headers,
      },
    }, (res) => {
      let raw = "";
      res.on("data", chunk => { raw += chunk; });
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          body: JSON.parse(raw || "{}"),
        });
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}