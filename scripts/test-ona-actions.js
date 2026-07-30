#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadOnaConfig } from "../lib/node-agent/config.js";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import { createOnaHttpServer } from "../lib/node-agent/http-server.js";
import {
  completePendingRestartActions,
  readManagementAction,
} from "../lib/node-agent/management-actions.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-ona-actions-"));
const { db } = openNodeMemoryDb({
  dbPath: path.join(tmpDir, "node_memory.sqlite"),
  nodeId: "resource://action-test",
  hostname: "action-test",
});

const config = loadOnaConfig({
  ONA_COP_DELIVERY: "0",
  ONA_BIND: "127.0.0.1",
  ONA_PORT: "0",
  ONA_HOSTNAME: "action-test",
  ONA_NODE_ID: "resource://action-test",
  ONA_READ_TOKEN: "read-token",
  ONA_ADMIN_TOKEN: "admin-token",
  ONA_MESH_OPEN_READ: "1",
});

let restartRequest = null;
let probeRuns = 0;
const server = createOnaHttpServer({
  config,
  db,
  startedAt: "2026-07-28T12:00:00Z",
  incarnation: "ona:action-test:first",
  restartDelayMs: 1,
  runProbe: async () => {
    probeRuns += 1;
    return {
      ok: true,
      summary: {
        health_score: 98,
        probe_count: 4,
        failed_count: 0,
        probed_at: "2026-07-28T12:01:00Z",
      },
    };
  },
  requestRestart: action => { restartRequest = action; },
});

try {
  const port = await listenEphemeral(server);
  const base = `http://127.0.0.1:${port}`;
  const readHeaders = { Authorization: "Bearer read-token" };
  const adminHeaders = { Authorization: "Bearer admin-token" };

  const catalogue = await fetchJson(`${base}/soma/actions`, { headers: readHeaders });
  assert.equal(catalogue.status, 200);
  assert.equal(catalogue.body.definitions["agent.restart"].interruption, true);

  const denied = await fetchJson(`${base}/soma/actions/observation.refresh`, {
    method: "POST",
    headers: readHeaders,
  });
  assert.equal(denied.status, 401);
  assert.equal(probeRuns, 0);

  // Mesh desk sesame (Tailscale trust) — no real admin token
  const deskRefresh = await fetchJson(`${base}/soma/actions/observation.refresh`, {
    method: "POST",
    headers: { Authorization: "Bearer sesame42" },
  });
  assert.equal(deskRefresh.status, 200);
  assert.equal(deskRefresh.body.state, "completed");
  assert.equal(probeRuns, 1);

  const refresh = await fetchJson(`${base}/soma/actions/observation.refresh`, {
    method: "POST",
    headers: adminHeaders,
  });
  assert.equal(refresh.status, 200);
  assert.equal(refresh.body.state, "completed");
  assert.equal(refresh.body.result.health_score, 98);
  assert.equal(probeRuns, 2);

  const refreshStatus = await fetchJson(
    `${base}/soma/actions/${encodeURIComponent(refresh.body.action_id)}`,
    { headers: readHeaders },
  );
  assert.equal(refreshStatus.status, 200);
  assert.equal(refreshStatus.body.action_id, refresh.body.action_id);

  const restart = await fetchJson(`${base}/soma/actions/agent.restart`, {
    method: "POST",
    headers: adminHeaders,
  });
  assert.equal(restart.status, 202);
  assert.equal(restart.body.state, "restarting");
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(restartRequest.action_id, restart.body.action_id);
  assert.equal(readManagementAction(db, restart.body.action_id).state, "restarting");

  const completed = completePendingRestartActions(db, "ona:action-test:second");
  assert.equal(completed.length, 1);
  assert.equal(completed[0].state, "completed");
  assert.equal(completed[0].previous_incarnation, "ona:action-test:first");
  assert.equal(completed[0].current_incarnation, "ona:action-test:second");

  console.log(JSON.stringify({
    ok: true,
    tests: [
      "action_catalogue",
      "admin_authority",
      "observation_refresh",
      "action_status",
      "restart_acceptance",
      "restart_incarnation_completion",
    ],
  }, null, 2));
} finally {
  await new Promise(resolve => server.close(resolve));
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

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  return {
    status: response.status,
    body: await response.json(),
  };
}
