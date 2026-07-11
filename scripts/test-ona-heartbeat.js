#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildOperiumNodeAttractor,
  ONA_CAPABILITY,
  ONA_TRANSPORT_PROFILE,
  resolveOnaAdvertiseEndpoint,
} from "../lib/node-agent/attractor.js";
import { runOnaHeartbeat } from "../lib/node-agent/heartbeat.js";

const cogentiaBlackboard = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "cogentia",
  "scripts",
  "lib",
  "packet-attractor-blackboard.js",
);

let validateAttractor;
try {
  ({ validateAttractor } = await import(pathToFileURL(cogentiaBlackboard).href));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: "cogentia_blackboard_module_missing",
    path: cogentiaBlackboard,
    message: error.message || null,
  }));
  process.exit(1);
}

const attractor = buildOperiumNodeAttractor({
  id: "attractor:i7-thinkpad-jhr:operium-node",
  resourceId: "resource://i7-thinkpad-jhr",
  hostname: "i7-thinkpad-jhr",
  endpointRef: "http://100.122.121.68:8794",
  status: "online",
  healthScore: 4,
  onaVersion: "0.1.0",
});

assert.equal(attractor.matches.capabilities[0], ONA_CAPABILITY);
assert.equal(attractor.transport.profile, ONA_TRANSPORT_PROFILE);
assert.equal(attractor.node.hostname, "i7-thinkpad-jhr");
assert.equal(attractor.metadata.health_score, 4);

const validated = validateAttractor(attractor);
assert.equal(validated.ok, true, validated.errors?.join("; "));
assert.equal(validated.attractor.transport.profile, ONA_TRANSPORT_PROFILE);

const endpoint = await resolveOnaAdvertiseEndpoint({
  env: {},
  hostname: "i7-thinkpad-jhr",
  catalogueTailscaleIp: "100.122.121.68",
  port: 8794,
  probeTailscale: false,
});
assert.equal(endpoint, "http://100.122.121.68:8794");

let healthCalls = 0;
const mockFetch = async (url, init = {}) => {
  if (String(url).endsWith("/health")) {
    healthCalls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        service: "operium-node-agent",
        health_score: 4,
      }),
    };
  }
  if (String(url).includes("/ops/blackboard/upsert")) {
    const payload = JSON.parse(init.body || "{}");
    assert.equal(payload.event, "cop/attractor.advertised");
    assert.equal(payload.attractor.transport.profile, ONA_TRANSPORT_PROFILE);
    assert.equal(payload.attractor.availability.status, "online");
    assert.match(payload.attractor.transport.endpoint_ref, /^http:\/\/100\.122\.121\.68:8794$/);
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, snapshot_at: "2026-07-10T12:00:00.000Z" }),
    };
  }
  throw new Error(`unexpected_fetch:${url}`);
};

const okResult = await runOnaHeartbeat({
  env: {
    COGENTIA_BLACKBOARD_URL: "https://cogentia.fractavolta.com",
    COGENTIA_BLACKBOARD_UPSERT_TOKEN: "test-token",
    ONA_ATTRACTOR_NODE_ID: "resource://i7-thinkpad-jhr",
    ONA_HOSTNAME: "i7-thinkpad-jhr",
    ONA_PORT: "8794",
  },
  hostname: "i7-thinkpad-jhr",
  catalogueTailscaleIp: "100.122.121.68",
  probeTailscale: false,
  fetch: mockFetch,
  fetchStatus: false,
});

assert.equal(okResult.ok, true);
assert.equal(okResult.exitCode, 0);
assert.equal(okResult.availability_status, "online");
assert.equal(healthCalls, 1);

let degradedResult;
const degradedFetch = async (url, init = {}) => {
  if (String(url).endsWith("/health")) {
    return {
      ok: false,
      status: 503,
      json: async () => ({ ok: false, error: "unavailable" }),
    };
  }
  if (String(url).includes("/ops/blackboard/upsert")) {
    const payload = JSON.parse(init.body || "{}");
    assert.equal(payload.attractor.availability.status, "degraded");
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, snapshot_at: "2026-07-10T12:00:00.000Z" }),
    };
  }
  throw new Error(`unexpected_fetch:${url}`);
};

degradedResult = await runOnaHeartbeat({
  env: {
    COGENTIA_BLACKBOARD_URL: "https://cogentia.fractavolta.com",
    COGENTIA_BLACKBOARD_UPSERT_TOKEN: "test-token",
    ONA_HOSTNAME: "i7-thinkpad-jhr",
  },
  hostname: "i7-thinkpad-jhr",
  catalogueTailscaleIp: "100.122.121.68",
  probeTailscale: false,
  fetch: degradedFetch,
});

assert.equal(degradedResult.ok, true);
assert.equal(degradedResult.exitCode, 1);
assert.equal(degradedResult.availability_status, "degraded");

const withdrawResult = await runOnaHeartbeat({
  env: {
    COGENTIA_BLACKBOARD_URL: "https://cogentia.fractavolta.com",
    COGENTIA_BLACKBOARD_UPSERT_TOKEN: "test-token",
    ONA_ATTRACTOR_WITHDRAW: "1",
    ONA_HOSTNAME: "i7-thinkpad-jhr",
  },
  hostname: "i7-thinkpad-jhr",
  catalogueTailscaleIp: "100.122.121.68",
  probeTailscale: false,
  fetch: async (url, init = {}) => {
    const payload = JSON.parse(init.body || "{}");
    assert.equal(payload.event, "cop/attractor.withdrawn");
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, snapshot_at: "2026-07-10T12:00:00.000Z" }),
    };
  },
});

assert.equal(withdrawResult.ok, true);
assert.equal(withdrawResult.withdraw, true);

console.log(JSON.stringify({
  ok: true,
  tests: [
    "buildOperiumNodeAttractor",
    "validateAttractor",
    "resolveOnaAdvertiseEndpoint",
    "heartbeat_online",
    "heartbeat_degraded",
    "heartbeat_withdraw",
  ],
}, null, 2));