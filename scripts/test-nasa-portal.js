#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import { loadOnaConfig } from "../lib/node-agent/config.js";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import { createOnaHttpServer } from "../lib/node-agent/http-server.js";
import { readNasaDnsStatus } from "../lib/node-agent/nasa-portal.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const observerHostname = process.env.NASA_TEST_HOSTNAME || "rpi3-view";
const observerNodeId = `resource://${observerHostname}`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ona-nasa-"));
const dnsStatusPath = path.join(tmpDir, "dns-status.json");
process.env.ONA_NASA_DNS_STATUS_JSON = dnsStatusPath;
fs.writeFileSync(dnsStatusPath, JSON.stringify({
  schema: "operium.nasa.dns-view.v1",
  observed_at: "2026-08-29T12:00:00.000Z",
  source: { kind: "operator-snapshot", reference: "test-fixture" },
  domains: [{
    domain: "fractavolta.com",
    migration_state: "pending",
    registrar: "Gandi",
    active_authoritative_dns: "Gandi LiveDNS",
    standby_dns: "Cloudflare",
    edge_mode: "dns-only",
    dnssec_state: "not_observed",
    api_token: "must-not-appear",
  }],
}));
const { db } = openNodeMemoryDb({
  dbPath: path.join(tmpDir, "node_memory.sqlite"),
  nodeId: observerNodeId,
  hostname: observerHostname,
});

const config = loadOnaConfig({
  ONA_COP_DELIVERY: "0",
  ONA_BIND: "127.0.0.1",
  ONA_HOSTNAME: observerHostname,
  ONA_NODE_ID: observerNodeId,
  ONA_ADMIN_TOKEN: "admin-token",
  ONA_MESH_OPEN_READ: "1",
  ONA_HEALTH_PUBLIC: "1",
  COGENTIA_OPS_STATE_DIR: tmpDir,
});

const server = createOnaHttpServer({
  config,
  db,
  startedAt: new Date().toISOString(),
  incarnation: `ona:${observerHostname}:test`,
  getNodeId: () => config.nodeId,
  runProbe: async () => ({
    ok: true,
    summary: { health_score: 3, probe_count: 1, failed_count: 0, probed_at: new Date().toISOString() },
  }),
  requestRestart: () => {},
});

const port = await new Promise((resolve, reject) => {
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  server.on("error", reject);
});
// Ensure self-probes in the fleet view target this ephemeral test listener.
config.port = port;

const base = `http://127.0.0.1:${port}`;
const nativeFetch = globalThis.fetch;
const fleetHosts = new Set([
  "fracta",
  "fracta2",
  "i7-thinkpad-jhr",
  "rpi3-view",
  "poco-jhr",
]);

// Keep fleet probes inside the test server. This test exercises the response
// contract, not live MagicDNS or peer availability.
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (fleetHosts.has(url.hostname)) {
    url.hostname = "127.0.0.1";
    url.port = String(port);
  }
  return nativeFetch(url, init);
};

try {
  const index = await fetch(`${base}/`);
  assert.equal(index.status, 200);
  const html = await index.text();
  assert.match(html, /La Nasa/i);
  assert.match(html, /Fleet perspective/i);

  const fleet = await fetch(`${base}/nasa/fleet`);
  assert.equal(fleet.status, 200);
  const fleetBody = await fleet.json();
  assert.equal(fleetBody.schema, "operium.edge-portal.fleet.v1");
  assert.equal(fleetBody.served_by, "ona-nasa-portal");
  assert.deepEqual(fleetBody.observer, {
    hostname: observerHostname,
    resource_id: observerNodeId,
  });
  assert.deepEqual(fleetBody.view, {
    id: "local-fractanet",
    membership: "registered-tailnet-nodes",
  });
  assert.equal(fleetBody.dns.availability, "available");
  assert.equal(fleetBody.dns.domains[0].domain, "fractavolta.com");
  assert.equal(fleetBody.dns.domains[0].active_authoritative_dns, "Gandi LiveDNS");
  assert.equal(Object.hasOwn(fleetBody.dns.domains[0], "api_token"), false);
  assert.equal(readNasaDnsStatus({ ONA_NASA_DNS_STATUS_JSON: path.join(tmpDir, "missing.json") }).availability, "unavailable");
  assert.equal(fleetBody.nodes.length, 5);
  // self should be online (this server)
  const self = fleetBody.nodes.find((n) => n.host === observerHostname);
  assert.equal(self.online, true);
  assert.equal(self.label, "This node");

  const node = await fetch(`${base}/cgi-bin/node?host=${encodeURIComponent(observerHostname)}`);
  assert.equal(node.status, 200);
  const pack = await node.json();
  assert.equal(pack.ok, true);
  assert.equal(pack.live, true);
  assert.equal(pack.served_by, "ona-nasa-portal");
  assert.ok(pack.status);
  assert.equal(pack.calendar?.schema, "operium.calendar.projection.v1");
  assert.equal(pack.calendar?.not_an_executor, true);

  const deniedAction = await fetch(`${base}/nasa/action?host=${encodeURIComponent(observerHostname)}&name=observation.refresh`);
  assert.equal(deniedAction.status, 404);

  const unauthorisedAction = await fetch(`${base}/nasa/action?host=${encodeURIComponent(observerHostname)}&name=observation.refresh`, {
    method: "POST",
  });
  assert.equal(unauthorisedAction.status, 401);

  const action = await fetch(`${base}/nasa/action?host=${encodeURIComponent(observerHostname)}&name=observation.refresh`, {
    method: "POST",
    headers: { Authorization: "Bearer admin-token" },
  });
  const act = await action.json();
  assert.equal(act.ok, true);
  assert.equal(act.mode, "in-process");

  console.log(JSON.stringify({
    ok: true,
    observer: fleetBody.observer,
    tests: ["static", "fleet", "node", "action_self"],
  }, null, 2));
} finally {
  globalThis.fetch = nativeFetch;
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
