#!/usr/bin/env node
import assert from "node:assert/strict";
import { pauseSession, formatPauseHuman } from "../lib/pause-session.js";

async function main() {
  const result = await pauseSession({ dryRun: true, fetchRemotes: false });

  assert.equal(result.schema, "operium.pause_state.v1");
  assert.ok(result.ok, "pause ok");
  assert.equal(result.dry_run, true);
  assert.ok(result.packet_id, "packet_id present");
  assert.ok(result.canonical_issue, "canonical_issue present");
  assert.ok(Array.isArray(result.repos_scanned), "repos_scanned is array");
  assert.ok(result.resume_hint, "resume_hint present");

  const human = formatPauseHuman(result);
  assert.ok(human.includes("FRACTANET SESSION PAUSE"), "human contains title");
  assert.ok(human.includes("Repositories Catalogued"), "human contains repos");

  console.log(JSON.stringify({
    ok: true,
    test: "pauseSession",
    packet_id: result.packet_id,
    canonical_issue: result.canonical_issue?.handle || "unknown",
    resume_hint: result.resume_hint,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
