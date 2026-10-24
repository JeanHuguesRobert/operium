#!/usr/bin/env node
import assert from "node:assert/strict";
import { checkpointSession, formatCheckpointHuman } from "../lib/checkpoint-session.js";

async function main() {
  const result = await checkpointSession({ dryRun: true, fetchRemotes: false, timeoutMs: 1500 });

  assert.equal(result.schema, "operium.checkpoint_state.v1");
  assert.ok(result.ok, "checkpoint ok");
  assert.equal(result.dry_run, true);
  assert.ok(result.packet_id, "packet_id present");
  assert.ok(result.packet_id.includes("checkpoint"), "packet_id contains checkpoint");
  assert.ok(result.canonical_issue, "canonical_issue present");
  assert.ok(result.security_scan?.clean, "security scan clean");
  assert.ok(Array.isArray(result.workspaces), "workspaces is array");
  assert.ok(result.mesh_status, "mesh_status present");
  assert.ok(result.fbf_gate, "fbf_gate present");

  const human = formatCheckpointHuman(result);
  assert.ok(human.includes("FRACTANET SESSION CHECKPOINT"), "human contains title");
  assert.ok(human.includes("Pre-flight Security Scan"), "human contains security scan");
  assert.ok(human.includes("FixBugsFirst Gate"), "human contains FBF gate");

  console.log(JSON.stringify({
    ok: true,
    test: "checkpointSession",
    packet_id: result.packet_id,
    canonical_issue: result.canonical_issue?.handle || "unknown",
    fbf_blocked: result.fbf_gate?.blocked === true,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
