#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadOnaConfig } from "../lib/node-agent/config.js";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import { applyProbeCycle } from "../lib/node-agent/local-state.js";
import { createOnaHttpServer } from "../lib/node-agent/http-server.js";
import { formatNodeDiagnoseHuman } from "../lib/format-node-human.js";
import {
  buildNodeDiagnose,
  exitCodeForDiagnose,
  mergeNextActions,
} from "../lib/node-diagnose.js";
import { runNodeDiagnoseCommand } from "../lib/node-cli.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staleFixturePath = path.resolve(__dirname, "../../cogentia/scripts/test/fixtures/ops-status-stale-blackboard.json");
const staleFixture = JSON.parse(fs.readFileSync(staleFixturePath, "utf8"));

assert.deepEqual(
  mergeNextActions(
    ["Restore fracta Guide MCP or aggregator reachability.", "Action A"],
    ["Action A", "Run operium node status --human and inspect failed probes."],
  ),
  [
    "Restore fracta Guide MCP or aggregator reachability.",
    "Action A",
    "Run operium node status --human and inspect failed probes.",
  ],
);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-node-diagnose-"));
const dbPath = path.join(tmpDir, "node_memory.sqlite");
const registryPath = path.join(tmpDir, "resources.yaml");

fs.writeFileSync(registryPath, `
version: 1
nodes:
  - resource_id: resource://diag-test
    hostname: diag-test
    capabilities: [agent.cli.gateway]
`);

const { db } = openNodeMemoryDb({
  dbPath,
  nodeId: "resource://diag-test",
  hostname: "diag-test",
});

applyProbeCycle(db, {
  probes: [
    { probe_kind: "ona", ok: true, skipped: false, target: "http://127.0.0.1:8794/health" },
    { probe_kind: "gateway", ok: true, skipped: false, target: "http://127.0.0.1:8793/health" },
  ],
  probed_at: new Date().toISOString(),
  resource_id: "resource://diag-test",
  catalogue_node: "diag-test",
}, {
  catalogue: { ok: true, nodes: [{ hostname: "diag-test", resource_id: "resource://diag-test" }] },
  nodeId: "resource://diag-test",
  hostname: "diag-test",
});

const config = loadOnaConfig({
  ONA_COP_DELIVERY: "0",
  ONA_BIND: "127.0.0.1",
  ONA_HOSTNAME: "diag-test",
  ONA_NODE_ID: "resource://diag-test",
  ONA_READ_TOKEN: "diag-read-token",
  OPERIUM_REGISTRY: registryPath,
});

const server = createOnaHttpServer({
  config,
  db,
  startedAt: new Date().toISOString(),
  getNodeId: () => "resource://diag-test",
});

const port = await listenEphemeral(server);
const onaBase = `http://127.0.0.1:${port}`;

const mockFetch = async (url) => {
  if (String(url).includes("/ops/status")) {
    return { ok: true, status: 200, url, body: staleFixture.ops_status };
  }
  if (String(url).includes("/ops/blackboard")) {
    return { ok: true, status: 200, url, body: staleFixture.blackboard };
  }
  return { ok: false, status: 404, url, body: { ok: false, error: "not_found" } };
};

const diagnose = await buildNodeDiagnose({
  url: onaBase,
  token: "diag-read-token",
  registryPath,
  aggregatorUrl: "http://127.0.0.1:9999",
  probe: true,
  fetch: mockFetch,
  probeTailscale: async () => ({
    ok: true,
    available: true,
    tailnet: "test-tailnet",
    hostname: "diag-test",
    peers: [{ hostname: "i7-thinkpad-jhr", online: true }],
  }),
  probeLocalServices: async () => ({ services: {} }),
});

assert.equal(diagnose.schema, "operium.node.diagnose.v1");
assert.ok(diagnose.layers?.node_agent);
assert.equal(diagnose.layers.node_agent.ok, true);
assert.equal(diagnose.node_status?.schema, "operium.node.status.v1");
assert.equal(diagnose.node_drift?.schema, "operium.node.drift.v1");
assert.ok(diagnose.drift.some(item => item.kind === "blackboard_stale"));
assert.ok(
  diagnose.next_actions.some(action => action.includes("CogentiaAttractorHeartbeat")),
  `expected heartbeat remediation, got ${JSON.stringify(diagnose.next_actions)}`,
);

const operiumFirst = mergeNextActions(
  ["Alpha", "Beta"],
  ["Beta", "Gamma"],
);
assert.deepEqual(operiumFirst, ["Alpha", "Beta", "Gamma"]);

const cliResult = await runNodeDiagnoseCommand({
  subcommand: "diagnose",
  url: onaBase,
  token: "diag-read-token",
  registryPath,
  aggregatorUrl: "http://127.0.0.1:9999",
  probe: true,
  fetch: mockFetch,
  probeTailscale: async () => ({
    ok: true,
    available: true,
    peers: [{ hostname: "i7-thinkpad-jhr", online: true }],
  }),
  probeLocalServices: async () => ({ services: {} }),
});
assert.equal(cliResult.ok, true);
assert.equal(cliResult.body.schema, "operium.node.diagnose.v1");

const human = formatNodeDiagnoseHuman(diagnose);
assert.match(human, /Fractanet diagnose/);
assert.match(human, /ONA\s+OK/);
assert.match(human, /Blackboard\s+fresh=0/);
assert.match(human, /CogentiaAttractorHeartbeat/);
assert.match(human, /JSON: operium node diagnose --json/);

assert.ok(exitCodeForDiagnose(diagnose) >= 0);

db.close();
await new Promise((resolve) => server.close(resolve));
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  tests: [
    "mergeNextActions",
    "buildNodeDiagnose",
    "stale_blackboard_fixture",
    "runNodeDiagnoseCommand",
    "formatNodeDiagnoseHuman",
    "exitCodeForDiagnose",
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