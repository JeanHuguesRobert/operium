#!/usr/bin/env node
/**
 * ONA_MESH_OPEN_READ=1 allows unauthenticated GET /node/status and /soma/object.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { loadOnaConfig } from "../lib/node-agent/config.js";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import { createOnaHttpServer } from "../lib/node-agent/http-server.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-ona-mesh-open-"));
const dbPath = path.join(tmpDir, "node_memory.sqlite");

function getJson(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: "127.0.0.1", port, path: pathname, headers }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => {
        resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null });
      });
    }).on("error", reject);
  });
}

try {
  const closed = loadOnaConfig({
    ONA_COP_DELIVERY: "0",
    ONA_BIND: "127.0.0.1",
    ONA_PORT: "0",
    ONA_HOSTNAME: "mesh-closed",
    ONA_NODE_ID: "resource://mesh-closed",
    ONA_READ_TOKEN: "secret-read",
    ONA_ADMIN_TOKEN: "secret-admin",
    ONA_MESH_OPEN_READ: "0",
    ONA_DB_PATH: dbPath,
    COGENTIA_OPS_STATE_DIR: tmpDir,
  });
  assert.equal(closed.meshOpenRead, false);

  const openCfg = loadOnaConfig({
    ONA_COP_DELIVERY: "0",
    ONA_BIND: "0.0.0.0",
    ONA_PORT: "0",
    ONA_HOSTNAME: "mesh-open",
    ONA_NODE_ID: "resource://mesh-open",
    ONA_READ_TOKEN: "secret-read",
    ONA_ADMIN_TOKEN: "secret-admin",
    ONA_MESH_OPEN_READ: "1",
    ONA_HEALTH_PUBLIC: "1",
    ONA_DB_PATH: dbPath,
    COGENTIA_OPS_STATE_DIR: tmpDir,
  });
  assert.equal(openCfg.meshOpenRead, true);

  const { db } = openNodeMemoryDb({
    dbPath,
    nodeId: openCfg.nodeId,
    hostname: openCfg.hostname,
  });
  const server = createOnaHttpServer({
    config: openCfg,
    db,
    startedAt: new Date().toISOString(),
  });
  const port = await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });

  const status = await getJson(port, "/node/status");
  assert.equal(status.status, 200, "status open without token");
  assert.equal(status.body?.schema, "operium.node.status.v1");

  const object = await getJson(port, "/soma/object");
  assert.equal(object.status, 200, "soma object open without token");

  const obs = await getJson(port, "/soma/observations");
  assert.equal(obs.status, 200, "soma observations open without token");

  // Admin still protected
  const probe = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/node/probe",
      method: "POST",
    }, (res) => {
      let raw = "";
      res.on("data", (c) => { raw += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on("error", reject);
    req.end();
  });
  assert.equal(probe.status, 401, "admin probe still requires token");

  await new Promise((resolve) => server.close(resolve));
  try { db.close(); } catch { /* ignore */ }
  console.log("ok test-ona-mesh-open-read");
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
}
