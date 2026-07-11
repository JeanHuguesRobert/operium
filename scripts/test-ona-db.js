#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { loadOnaConfig } from "../lib/node-agent/config.js";
import { openNodeMemoryDb, readLocalState } from "../lib/node-agent/db.js";
import { LATEST_SCHEMA_VERSION, tableNames } from "../lib/node-agent/migrate.js";
import { resolveOpsStateDir } from "../lib/node-agent/paths.js";
import { createOnaHttpServer, startOnaHttpServer } from "../lib/node-agent/http-server.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-ona-test-"));
const dbPath = path.join(tmpDir, "node_memory.sqlite");

const { db, migration } = openNodeMemoryDb({
  dbPath,
  nodeId: "resource://test-node",
  hostname: "test-node",
});
assert.equal(migration.latest, LATEST_SCHEMA_VERSION);
assert.ok(migration.applied.includes(1));
assert.ok(migration.applied.includes(2));

for (const table of tableNames()) {
  const row = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(table);
  assert.ok(row, `missing table ${table}`);
}

const local = readLocalState(db);
assert.equal(local.node_id, "resource://test-node");
assert.equal(local.hostname, "test-node");
assert.equal(local.schema_version, LATEST_SCHEMA_VERSION);

db.close();

assert.throws(
  () => loadOnaConfig({ ONA_COP_DELIVERY: "1", ONA_PEER_TOKEN: "" }),
  (error) => error.code === "missing_ona_peer_token",
);

const config = loadOnaConfig({
  ONA_COP_DELIVERY: "0",
  ONA_BIND: "127.0.0.1",
  ONA_PORT: "0",
  ONA_HOSTNAME: "test-node",
  ONA_NODE_ID: "resource://test-node",
});

const { db: httpDb } = openNodeMemoryDb({
  dbPath: ":memory:",
  nodeId: config.nodeId,
  hostname: config.hostname,
  seedLocalState: true,
});

const server = createOnaHttpServer({
  config,
  db: httpDb,
  startedAt: new Date().toISOString(),
});

const listen = await startOnaHttpServer(server, { ...config, port: 0 });
const address = server.address();
const port = typeof address === "object" && address ? address.port : 8794;

const health = await fetchJson(`http://127.0.0.1:${port}/health`);
assert.equal(health.ok, true);
assert.equal(health.service, "operium-node-agent");
assert.equal(health.node_id, "resource://test-node");

const statusUnauthorized = await fetchJson(`http://127.0.0.1:${port}/node/status`, {
  expectStatus: 401,
});
assert.equal(statusUnauthorized.error, "unauthorized");

await new Promise((resolve) => server.close(resolve));
httpDb.close();

const stateDir = resolveOpsStateDir({});
assert.ok(stateDir.includes(".cogentia"));

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  tests: [
    "migrations",
    "tables",
    "local_state_seed",
    "cop_delivery_guard",
    "health_endpoint",
    "status_auth",
    "paths",
  ],
}, null, 2));

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          if (options.expectStatus && res.statusCode !== options.expectStatus) {
            reject(new Error(`expected ${options.expectStatus}, got ${res.statusCode}`));
            return;
          }
          resolve(parsed);
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}