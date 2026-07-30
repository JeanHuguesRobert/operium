#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { loadOnaConfig } from "../lib/node-agent/config.js";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import { applyProbeCycle } from "../lib/node-agent/local-state.js";
import { createOnaHttpServer } from "../lib/node-agent/http-server.js";
import {
  buildSomaDescriptor,
  buildSomaObject,
  buildSomaObservations,
  buildSomaVocabulary,
} from "../lib/node-agent/soma.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-ona-soma-"));
const { db } = openNodeMemoryDb({
  dbPath: path.join(tmpDir, "node_memory.sqlite"),
  nodeId: "resource://fracta-test",
  hostname: "fracta-test",
});

try {
  applyProbeCycle(db, {
    probes: [
      { probe_kind: "ona", ok: true, skipped: false, latency_ms: 3, target: "http://127.0.0.1:8794/health" },
      { probe_kind: "gateway", ok: false, skipped: false, latency_ms: 12, target: "http://127.0.0.1:8793/health" },
    ],
    probed_at: "2026-07-28T12:00:00Z",
    resource_id: "resource://fracta-test",
    catalogue_node: "fracta-test",
  }, {
    catalogue: { ok: true },
    nodeId: "resource://fracta-test",
    hostname: "fracta-test",
  });

  const config = loadOnaConfig({
    ONA_COP_DELIVERY: "0",
    ONA_BIND: "127.0.0.1",
    ONA_HOSTNAME: "fracta-test",
    ONA_NODE_ID: "resource://fracta-test",
    ONA_READ_TOKEN: "soma-read-token",
    // Force closed mesh-open so this test still checks bearer on /soma/object
    ONA_HEALTH_PUBLIC: "0",
    ONA_MESH_OPEN_READ: "0",
  });
  const runtime = {
    hostname: "fracta-test",
    platform: "linux",
    architecture: "x64",
    uptimeSeconds: 3600,
    totalMemory: 1024,
    freeMemory: 256,
    loadAvailable: true,
    load1: 0.42,
    load5: 0.5,
    load15: 0.75,
  };

  const descriptor = buildSomaDescriptor({ config, nodeId: config.nodeId });
  assert.equal(descriptor.schema, "soma.descriptor.v0");
  assert.equal(descriptor.class, "operium.node");
  assert.ok(descriptor.capabilities.includes("soma.object.read"));

  const vocabulary = buildSomaVocabulary();
  assert.equal(vocabulary.classes["operium.node"].extends, "soma.managed-object");
  assert.equal(vocabulary.attributes["system.uptime"].behaviour_type, "Gauge");
  assert.equal(vocabulary.attributes["system.memory.free"].sampling.supported, true);
  assert.equal(vocabulary.attributes["system.cpu.load1"].behaviour_type, "Gauge");
  assert.equal(vocabulary.attributes["system.memory.used_percent"].unit, "percent");

  const object = buildSomaObject({
    config,
    db,
    nodeId: config.nodeId,
    observedAt: "2026-07-28T12:00:00Z",
    runtime,
  });
  assert.equal(object.id, "resource://fracta-test");
  assert.equal(object.class, "operium.node");
  assert.equal(object.attributes["system.uptime"].value, 3600);
  assert.equal(object.attributes["system.memory.free"].unit, "byte");
  assert.equal(object.attributes["system.memory.used"].value, 768);
  assert.equal(object.attributes["system.memory.used_percent"].value, 75);
  assert.equal(object.attributes["system.memory.used_percent"].unit, "percent");
  assert.equal(object.attributes["system.cpu.load1"].value, 0.42);
  assert.equal(object.attributes["system.cpu.load5"].value, 0.5);
  assert.equal(object.attributes["system.cpu.load15"].value, 0.75);
  assert.equal(object.children.length, 2);
  assert.equal(object.children[0].class, "operium.service");
  assert.deepEqual(object.actions, ["observation.refresh", "agent.restart"]);

  // Windows-style runtime: no loadavg
  const winObject = buildSomaObject({
    config,
    db,
    nodeId: config.nodeId,
    observedAt: "2026-07-28T12:00:00Z",
    runtime: {
      ...runtime,
      platform: "win32",
      loadAvailable: false,
      load1: 0,
      load5: 0,
      load15: 0,
    },
  });
  assert.equal(winObject.attributes["system.cpu.load1"], undefined);
  assert.ok(winObject.attributes["system.memory.used_percent"]);

  const observations = buildSomaObservations({
    config,
    db,
    nodeId: config.nodeId,
    observedAt: "2026-07-28T12:00:00Z",
    runtime,
  });
  assert.equal(observations.schema, "soma.observations.v0");
  assert.ok(observations.observations.some(item => item.attribute === "system.uptime"));
  assert.ok(observations.observations.some(item => item.attribute === "service.probe-latency"));
  assert.ok(observations.observations.some(item => item.attribute === "system.cpu.load1"));
  assert.ok(observations.observations.some(item => item.attribute === "system.memory.used_percent"));

  const server = createOnaHttpServer({
    config,
    db,
    startedAt: "2026-07-28T11:00:00Z",
    getNodeId: () => config.nodeId,
  });
  const port = await listenEphemeral(server);
  try {
    const denied = await fetchJson(`http://127.0.0.1:${port}/soma/object`);
    assert.equal(denied.status, 401);

    const headers = { Authorization: "Bearer soma-read-token" };
    const liveDescriptor = await fetchJson(`http://127.0.0.1:${port}/.well-known/soma`);
    assert.equal(liveDescriptor.body.schema, "soma.descriptor.v0");
    const liveObject = await fetchJson(`http://127.0.0.1:${port}/soma/object`, { headers });
    assert.equal(liveObject.body.id, "resource://fracta-test");
    const liveVocabulary = await fetchJson(`http://127.0.0.1:${port}/soma/vocabulary`);
    assert.ok(liveVocabulary.body.attributes["core.user-label"]);
    const liveObservations = await fetchJson(`http://127.0.0.1:${port}/soma/observations`, { headers });
    assert.ok(liveObservations.body.observations.length >= 4);
    const liveActions = await fetchJson(`http://127.0.0.1:${port}/soma/actions`, { headers });
    assert.equal(liveActions.body.definitions["observation.refresh"].implemented, true);
    assert.equal(liveActions.body.definitions["agent.restart"].implemented, true);
    assert.equal(liveActions.body.definitions["agent.upgrade"].implemented, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log(JSON.stringify({
    ok: true,
    tests: [
      "soma_descriptor",
      "soma_vocabulary",
      "soma_object",
      "soma_observations",
      "soma_http_auth",
      "soma_http_resources",
      "soma_action_catalogue",
    ],
  }, null, 2));
} finally {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

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

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers: options.headers || {} }, (res) => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body || "{}") });
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}
