#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  buildDivergenceReport,
  buildDivergenceContinuations,
  buildReadOnlyProbeScript,
  collectNodeObservations,
  collectNodeObservation,
  parseReadOnlyProbe,
} from "../lib/fractanet-observation.js";

const node = {
  node_id: "resource://fixture-fracta",
  ssh_target: "fixture-fracta",
  services: [{ name: "mcp-cogentia.service", expected_state: "active" }],
  repositories: [{ id: "cogentia", path: "/srv/cogentia/repos/cogentia", revision: "0123456789abcdef", allow_dirty: false }],
};
const script = buildReadOnlyProbeScript(node);
assert.match(script, /systemctl is-active 'mcp-cogentia\.service'/);
assert.match(script, /git -C '\/srv\/cogentia\/repos\/cogentia' rev-parse HEAD/);
assert.doesNotMatch(script, /restart|stop|reset|push|pull/);

const stdout = "os_hostname\tfracta\nservice\tmcp-cogentia.service\tactive\nrepository\tcogentia\t0123456789abcdef\t0\n";
assert.deepEqual(parseReadOnlyProbe(stdout, node), {
  os_hostname: "fracta",
  services: [{ name: "mcp-cogentia.service", state: "active" }],
  repositories: [{ id: "cogentia", revision: "0123456789abcdef", dirty_entries: 0 }],
});

const runSsh = async ({ target, script: received }) => {
  assert.equal(target, "fixture-fracta");
  assert.equal(received, script);
  return { stdout };
};
const observedAt = "2026-09-21T12:00:00.000Z";
const observation = await collectNodeObservation({ node, runSsh, observedAt });
assert.equal(observation.ok, true);
assert.equal(observation.evidence_digest.length, 64);
const report = buildDivergenceReport({
  manifest: { schema: "operium.fractanet.observation-manifest.v1", nodes: [node] },
  observations: [observation],
  reportedAt: observedAt,
});
assert.equal(report.ok, true);
assert.equal(report.divergences.length, 0);

const drifted = structuredClone(observation);
drifted.observation.services[0].state = "inactive";
const first = buildDivergenceReport({ manifest: { schema: "operium.fractanet.observation-manifest.v1", nodes: [node] }, observations: [drifted], reportedAt: observedAt });
const second = buildDivergenceReport({ manifest: { schema: "operium.fractanet.observation-manifest.v1", nodes: [node] }, observations: [drifted], reportedAt: observedAt });
assert.equal(first.ok, false);
assert.deepEqual(first, second);
assert.equal(first.divergences[0].invariant, "service:mcp-cogentia.service");
const continuations = buildDivergenceContinuations(first);
assert.equal(continuations.length, 1);
assert.equal(continuations[0].status, "active");
assert.equal(continuations[0].kind, "operium.fractanet.divergence");

const intermittent = buildDivergenceReport({
  manifest: { schema: "operium.fractanet.observation-manifest.v1", nodes: [{ ...node, availability: { intermittent: true } }] },
  observations: [{ ...observation, ok: false, error: "ssh_observation_failed" }],
  reportedAt: observedAt,
});
assert.equal(intermittent.ok, true);
assert.equal(intermittent.divergences.length, 0);
assert.equal(intermittent.uncertainties[0].reason, "declared_intermittent_node");

const identityMismatch = buildDivergenceReport({
  manifest: { schema: "operium.fractanet.observation-manifest.v1", nodes: [{ ...node, expected_os_hostname: "expected-host" }] },
  observations: [observation],
  reportedAt: observedAt,
});
assert.equal(identityMismatch.divergences[0].invariant, "os_hostname");

let active = 0;
let peak = 0;
const batch = await collectNodeObservations({
  nodes: [node, { ...node, node_id: "resource://fixture-fracta-2", ssh_target: "fixture-fracta-2" }],
  concurrency: 1,
  observedAt,
  runSsh: async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active -= 1;
    return { stdout };
  },
});
assert.equal(batch.length, 2);
assert.equal(peak, 1);

console.log("fractanet observation tests passed");
