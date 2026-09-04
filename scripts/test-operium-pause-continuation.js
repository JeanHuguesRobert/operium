#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { pauseSession, formatPauseHuman } from "../lib/pause-session.js";
import {
  emitChoicePointContinuation,
  loadContinuation,
  resolveContinuation,
  resolveContinuationsDir,
} from "../lib/cogentia-bridge.js";

async function main() {
  console.log("▶ Testing Choice Point Continuation Protocol in Operium...");

  // 1. Direct emission test
  const testId = `ctn_pause_test_${Date.now().toString(36)}`;
  const emitted = emitChoicePointContinuation({
    id: testId,
    candidates: [
      { handle: "barons-Mariani/55", reason: "Current active topic" },
      { handle: "operium/52", reason: "Previous session anchor" },
    ],
    topic: "test-continuation-topic",
  });

  assert.equal(emitted.protocol, "cogentia.continuation.v2");
  assert.equal(emitted.status, "active");
  assert.equal(emitted.id, testId);
  assert.equal(emitted.candidates.length, 2);
  assert.ok(fs.existsSync(emitted.file_path), "continuation file written to disk");

  // 2. Direct loading test
  const loaded = loadContinuation(testId);
  assert.ok(loaded, "continuation loaded successfully");
  assert.equal(loaded.protocol, "cogentia.continuation.v2");
  assert.equal(loaded.id, testId);
  assert.equal(loaded.status, "active");

  // 3. Test pauseSession resumption with continuation
  const resumeResult = await pauseSession({
    dryRun: true,
    fetchRemotes: false,
    resumeContinuation: testId,
    issue: "barons-Mariani/55",
  });

  assert.ok(resumeResult.ok, "pause resumption succeeded");
  assert.equal(resumeResult.canonical_issue?.handle, "barons-Mariani/55");
  assert.equal(resumeResult.resolved_continuation, testId);

  // 4. Test direct resolution
  const resolved = resolveContinuation(testId, {
    decision: "barons-Mariani/55",
    reason: "unit test resolution",
  });
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolution?.decision, "barons-Mariani/55");

  // Cleanup test file
  try {
    if (fs.existsSync(emitted.file_path)) {
      fs.unlinkSync(emitted.file_path);
    }
  } catch {
    // ignore
  }

  // 5. Test formatPauseHuman with pending_continuation
  const mockPending = {
    status: "pending_continuation",
    continuation_id: "ctn_pause_mock123",
    question: "Quelle issue GitHub pour cette pause ?",
    candidates: [
      { handle: "barons-Mariani/55", reason: "Topique actuel" },
      { handle: "operium/52", reason: "Ancien topique" },
    ],
    resume_hint: "operium pause --resume-continuation ctn_pause_mock123 --issue (handle)",
  };

  const human = formatPauseHuman(mockPending);
  assert.ok(human.includes("CHOICE POINT REQUIRED"), "human contains choice point title");
  assert.ok(human.includes("Candidate Issues Detected"), "human contains candidate section");
  assert.ok(human.includes("barons-Mariani/55"), "human lists barons-Mariani/55");

  console.log(JSON.stringify({
    ok: true,
    test: "pauseContinuationProtocol",
    protocol: "cogentia.continuation.v2",
    choice_point_verified: true,
    resumption_verified: true,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
