#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import { loadOnaConfig } from "../lib/node-agent/config.js";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import { createOnaHttpServer } from "../lib/node-agent/http-server.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ona-nasa-"));
const { db } = openNodeMemoryDb({
  dbPath: path.join(tmpDir, "node_memory.sqlite"),
  nodeId: "resource://rpi3-view",
  hostname: "rpi3-view",
});

const config = loadOnaConfig({
  ONA_COP_DELIVERY: "0",
  ONA_BIND: "127.0.0.1",
  ONA_HOSTNAME: "rpi3-view",
  ONA_NODE_ID: "resource://rpi3-view",
  ONA_MESH_OPEN_READ: "1",
  ONA_HEALTH_PUBLIC: "1",
  COGENTIA_OPS_STATE_DIR: tmpDir,
});

const server = createOnaHttpServer({
  config,
  db,
  startedAt: new Date().toISOString(),
  incarnation: "ona:rpi3-view:test",
  getNodeId: () => config.nodeId,
  runProbe: async () => ({
    ok: true,
    summary: { health_score: 3, probe_count: 1, failed_count: 0, probed_at: new Date().toISOString() },
  }),
});

const port = await new Promise((resolve, reject) => {
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  server.on("error", reject);
});

const base = `http://127.0.0.1:${port}`;

try {
  const index = await fetch(`${base}/`);
  assert.equal(index.status, 200);
  const html = await index.text();
  assert.match(html, /La Nasa/i);

  const fleet = await fetch(`${base}/nasa/fleet`);
  assert.equal(fleet.status, 200);
  const fleetBody = await fleet.json();
  assert.equal(fleetBody.schema, "operium.edge-portal.fleet.v1");
  assert.equal(fleetBody.served_by, "ona-nasa-portal");
  assert.equal(fleetBody.nodes.length, 4);
  // self should be online (this server)
  const self = fleetBody.nodes.find((n) => n.host === "rpi3-view");
  assert.equal(self.online, true);

  const node = await fetch(`${base}/cgi-bin/node?host=rpi3-view`);
  assert.equal(node.status, 200);
  const pack = await node.json();
  assert.equal(pack.ok, true);
  assert.equal(pack.live, true);
  assert.equal(pack.served_by, "ona-nasa-portal");
  assert.ok(pack.status);

  const action = await fetch(`${base}/nasa/action?host=rpi3-view&name=observation.refresh`);
  assert.equal(action.status, 200);
  const act = await action.json();
  assert.equal(act.ok, true);
  assert.equal(act.mode, "in-process");

  console.log(JSON.stringify({ ok: true, tests: ["static", "fleet", "node", "action_self"] }, null, 2));
} finally {
  await new Promise((r) => server.close(r));
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
