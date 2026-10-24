#!/usr/bin/env node
import assert from "node:assert/strict";
import { reconSession, formatResumeHuman } from "../lib/resume-session.js";

async function main() {
  const result = await reconSession({ probe: false, timeoutMs: 1000 });

  assert.equal(result.schema, "operium.resume_recon.v1");
  assert.ok(result.timestamp, "timestamp present");
  assert.ok(result.anchor, "anchor present");
  assert.ok(result.fbf_gate, "fbf_gate present");
  assert.equal(typeof result.fbf_gate.blocked, "boolean");
  assert.ok(Array.isArray(result.git_deltas), "git_deltas is array");

  const human = formatResumeHuman(result);
  assert.ok(human.includes("FRACTANET RE-ENTRY CONTEXT"), "human contains title");
  assert.ok(human.includes("FixBugsFirst Gate"), "human contains FBF gate");

  console.log(JSON.stringify({
    ok: true,
    test: "reconSession",
    anchor_packet: result.anchor?.packet_id || "none",
    canonical_issue: result.canonical_issue?.handle || "none",
    fbf_blocked: result.fbf_gate.blocked,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
