#!/usr/bin/env node

import assert from "node:assert/strict";
import { buildOperiumUp } from "../lib/operium-up.js";
import { mapRemoteStatus, summarizeHealth } from "../lib/runtime-map.js";
import { computeDrift } from "../lib/drift.js";

const legacy = {
  ok: true,
  generated_at: "2026-07-04T00:00:00.000Z",
  mcp: { ok: true, version: "0.1.0" },
  guide: {
    ok: true,
    context: {
      retrieval_backend: "inox-session",
      inox_retrieval: { configured: true, url: "http://100.0.0.1:8792", transport: "inox.session.v1" },
    },
  },
  blackboard: { attractor_count: 1, fresh_attractor_count: 1, attractors: [], recent_events: [] },
};

const mapped = mapRemoteStatus(legacy);
assert.equal(mapped.layers.retrieval.backend, "inox-session");
assert.equal(mapped.layers.retrieval.phase2_wired, false);

const summary = summarizeHealth({
  runtime: mapped,
  mesh: { peers: [{ hostname: "i7-thinkpad-jhr", online: true }] },
  drift: [],
  catalogue: { planned_nodes: ["rpi3-view"] },
});
assert.ok(summary.health_score >= 3);

const drift = computeDrift({
  catalogue: { nodes: [], planned_nodes: ["rpi3-view"] },
  mesh: { available: true, peers: [] },
  runtime: mapped,
  local: {},
});
assert.ok(drift.some(item => item.kind === "catalogue_vs_live"));

const result = await buildOperiumUp({ probe: false });
assert.equal(result.schema, "operium.up.v1");
assert.equal(result.observer.probe_mode, "catalogue_only");
assert.ok(Array.isArray(result.drift));
assert.ok(Array.isArray(result.next_actions));

console.log(JSON.stringify({ ok: true, tests: ["mapRemoteStatus", "summarizeHealth", "computeDrift", "buildOperiumUp"] }, null, 2));