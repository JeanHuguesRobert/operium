#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const opsApiUrl = pathToFileURL(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../apps/console/src/lib/ops-api.js"),
).href;

const {
  buildNodeOpsPath,
  encodeNodeId,
  healthTone,
  listOnaAttractors,
} = await import(opsApiUrl);

assert.equal(encodeNodeId("resource://fracta"), "resource%3A%2F%2Ffracta");
assert.equal(
  buildNodeOpsPath("resource://i7-thinkpad-jhr", "status"),
  "/ops/node/resource%3A%2F%2Fi7-thinkpad-jhr/status",
);
assert.equal(healthTone(4), "ok");
assert.equal(healthTone(2), "bad");

const nodes = listOnaAttractors({
  attractors: [
    {
      id: "attractor:fracta:operium-node",
      node: { resource_id: "resource://fracta", hostname: "fracta" },
      matches: { capabilities: ["operium.node.v1"] },
      availability: { status: "online", last_seen: new Date().toISOString(), ttl_seconds: 300 },
      transport: { endpoint_ref: "http://100.91.12.74:8794" },
      metadata: { health_score: 4 },
    },
    {
      id: "attractor:other:gateway",
      matches: { capabilities: ["agent.cli.gateway"] },
    },
  ],
});
assert.equal(nodes.length, 1);
assert.equal(nodes[0].hostname, "fracta");
assert.equal(nodes[0].fresh, true);

console.log(JSON.stringify({
  ok: true,
  tests: [
    "encodeNodeId",
    "buildNodeOpsPath",
    "healthTone",
    "listOnaAttractors",
  ],
}, null, 2));