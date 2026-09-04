#!/usr/bin/env node
import assert from "node:assert/strict";
import { statusSession, formatStatusHuman } from "../lib/status-session.js";

async function main() {
  const result = await statusSession({ timeoutMs: 1500, probe: false });

  assert.equal(result.schema, "operium.session_status.v1");
  assert.ok(result.ok, "status ok");
  assert.ok(result.session, "session present");
  assert.ok(Array.isArray(result.workspaces), "workspaces is array");
  assert.ok(result.workspaces.length >= 3, "scanned at least 3 repos");
  assert.ok(result.fbf_gate, "fbf_gate present");

  const human = formatStatusHuman(result);
  assert.ok(human.includes("FRACTANET SITREP / SESSION STATUS"), "human contains title");
  assert.ok(human.includes("L'INTENTION"), "human contains intention");
  assert.ok(human.includes("LA MATIÈRE"), "human contains matiere");
  assert.ok(human.includes("LA BOUSSOLE"), "human contains boussole");

  console.log(JSON.stringify({
    ok: true,
    test: "statusSession",
    session_state: result.session.epistemic_status,
    canonical_issue: result.session.canonical_issue?.handle || "unknown",
    fbf_blocked: result.fbf_gate.blocked === true,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
