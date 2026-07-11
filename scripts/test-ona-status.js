#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { loadOnaConfig } from "../lib/node-agent/config.js";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import { computeHealthScore, applyProbeCycle } from "../lib/node-agent/local-state.js";
import { createProbeWorker } from "../lib/node-agent/probe-worker.js";
import { buildNodeStatus } from "../lib/node-agent/status.js";
import { createOnaHttpServer, startOnaHttpServer } from "../lib/node-agent/http-server.js";
import { probeOnaServices } from "../lib/probes.js";

const servers = [];
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-ona-status-"));
const dbPath = path.join(tmpDir, "node_memory.sqlite");

try {
  const onaPort = await startMockService({ ok: true, service: "operium-node-agent" });
  const gatewayPort = await startMockService({ ok: true, service: "agent-cli-gateway" });
  const inoxPort = await startMockService({ ok: true, service: "inox-serve" });
  const aggregatorPort = await startMockService({
    ok: true,
    schema: "operium.up.v1",
    role: "runtime-aggregator",
  });

  const catalogue = {
    ok: true,
    nodes: [{
      resource_id: "resource://test-thinkpad",
      hostname: "test-thinkpad",
      capabilities: ["agent.cli.gateway", "inox-serve"],
      agent_gateway: { port: gatewayPort },
      transport: {
        local_url: `http://127.0.0.1:${inoxPort}`,
        inox_serve_port: inoxPort,
      },
    }],
  };

  const cycle = await probeOnaServices(catalogue, {
    hostname: "test-thinkpad",
    onaPort,
    env: {
      COGENTIA_BLACKBOARD_URL: `http://127.0.0.1:${aggregatorPort}/ops/blackboard`,
    },
    timeoutMs: 3000,
  });

  assert.equal(cycle.catalogue_node, "test-thinkpad");
  assert.equal(cycle.resource_id, "resource://test-thinkpad");

  const kinds = cycle.probes.map(probe => probe.probe_kind);
  assert.deepEqual(kinds, ["ona", "gateway", "inox", "aggregator"]);
  assert.ok(cycle.probes.every(probe => probe.skipped || probe.ok === true));

  const failedCycle = {
    probes: [
      { probe_kind: "ona", ok: true, skipped: false },
      { probe_kind: "gateway", ok: false, skipped: false },
      { probe_kind: "inox", ok: true, skipped: false },
    ],
    probed_at: new Date().toISOString(),
  };
  assert.equal(computeHealthScore(failedCycle.probes, catalogue), 2);
  assert.equal(computeHealthScore(cycleAllOk(), catalogue), 4);

  const { db } = openNodeMemoryDb({
    dbPath,
    nodeId: "resource://test-thinkpad",
    hostname: "test-thinkpad",
  });

  const summary = applyProbeCycle(db, cycle, {
    catalogue,
    nodeId: "resource://test-thinkpad",
    hostname: "test-thinkpad",
  });
  assert.ok(summary.health_score >= 3);
  assert.equal(summary.probe_count, 4);

  const probeRows = db.prepare("SELECT COUNT(*) AS count FROM probe_history").get();
  assert.equal(Number(probeRows.count), 4);

  const config = loadOnaConfig({
    ONA_COP_DELIVERY: "0",
    ONA_BIND: "127.0.0.1",
    ONA_PORT: String(onaPort),
    ONA_HOSTNAME: "test-thinkpad",
    ONA_NODE_ID: "resource://test-thinkpad",
    ONA_READ_TOKEN: "read-test-token",
  });

  const status = buildNodeStatus({
    config,
    db,
    startedAt: new Date().toISOString(),
    nodeId: "resource://test-thinkpad",
  });
  assert.equal(status.schema, "operium.node.status.v1");
  assert.equal(status.node_id, "resource://test-thinkpad");
  assert.equal(status.hostname, "test-thinkpad");
  assert.ok(status.probes.applicable_count >= 1);
  assert.ok(status.sqlite_stats.probe_history >= 4);

  const worker = createProbeWorker({
    db,
    config: {
      ...config,
      port: onaPort,
      registryPath: path.join(tmpDir, "missing-registry.yaml"),
      env: {
        ...config.env,
        COGENTIA_BLACKBOARD_URL: `http://127.0.0.1:${aggregatorPort}/ops/blackboard`,
      },
    },
  });

  const workerResult = await worker.runCycle({
    probe: false,
  });
  assert.equal(workerResult.ok, true);
  assert.equal(workerResult.cycle.probes.filter(probe => probe.skipped).length, 4);

  const httpServer = createOnaHttpServer({
    config,
    db,
    startedAt: new Date().toISOString(),
    getNodeId: () => "resource://test-thinkpad",
  });
  const apiPort = await listenEphemeral(httpServer);
  const apiStatus = await fetchJson(`http://127.0.0.1:${apiPort}/node/status`, {
    headers: { Authorization: "Bearer read-test-token" },
  });
  assert.equal(apiStatus.schema, "operium.node.status.v1");
  assert.equal(apiStatus.node_id, "resource://test-thinkpad");
  assert.ok(Array.isArray(apiStatus.probes.items));

  db.close();
  console.log(JSON.stringify({
    ok: true,
    tests: [
      "probeOnaServices",
      "computeHealthScore",
      "applyProbeCycle",
      "buildNodeStatus",
      "probeWorker",
      "node_status_http",
    ],
  }, null, 2));
} finally {
  for (const server of servers) {
    await new Promise((resolve) => server.close(resolve));
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function cycleAllOk() {
  return [
    { probe_kind: "ona", ok: true, skipped: false },
    { probe_kind: "gateway", ok: true, skipped: false },
    { probe_kind: "inox", ok: true, skipped: false },
    { probe_kind: "aggregator", ok: true, skipped: false },
  ];
}

function startMockService(body) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const payload = JSON.stringify(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(payload);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      servers.push(server);
      resolve(address.port);
    });
  });
}

function listenEphemeral(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("invalid_listen_address"));
        return;
      }
      servers.push(server);
      resolve(address.port);
    });
    server.on("error", reject);
  });
}

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const headers = options.headers || {};
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