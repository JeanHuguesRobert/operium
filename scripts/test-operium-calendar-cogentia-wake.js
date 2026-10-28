#!/usr/bin/env node
/**
 * operium/scripts/test-operium-calendar-cogentia-wake.js
 *
 * End-to-end verification of Phase 4 (Temporal Wiring):
 * 1. Schedules a Cogentia job obligation (cop/node.wake.v1) in FractaCalendar
 * 2. Runs calendar tick (runDueCalendarObligations)
 * 3. Asserts the wake packet is dispatched to Cogentia (cogentia-wake.js)
 * 4. Asserts structured execution evidence is returned and recorded in SQLite cop_events
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import { upsertWakePacket } from "../lib/node-agent/calendar-store.js";
import { runDueCalendarObligations } from "../lib/node-agent/calendar-runner.js";
import { listCopEvents, COP_CALENDAR_KINDS } from "../lib/node-agent/cop-events.js";

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-wake-test-"));
  const dbPath = path.join(tmpDir, "node_memory.sqlite");
  const now = new Date().toISOString();

  const { db } = openNodeMemoryDb(dbPath);

  // 1. Create a wake packet for a Cogentia job
  const wakePacket = {
    packet_id: `cop:wake:test-cogentia-sleep:${Date.now()}`,
    packet_type: "cop/node.wake.v1",
    created_at: now,
    target_node: "thinkpad",
    payload: {
      due_at: now,
      cadence: "manual",
      stop_condition: "evidence.ok == true",
      packet: {
        envelope: {
          packet_id: "cop:job:cogentia-sleep-cycle",
          packet_kind: "cogentia.job",
        },
        payload: {
          job: "corpus.sleep_cycle",
          mode: "quick",
        },
      },
    },
  };

  // 2. Schedule in FractaCalendar
  const obligation = upsertWakePacket(db, wakePacket, {
    node_id: "resource://thinkpad",
    hostname: "thinkpad",
    now,
  });

  assert.ok(obligation, "obligation created");
  assert.equal(obligation.kind, "cogentia.job");

  // 3. Tick calendar
  const tickResult = await runDueCalendarObligations(db, { now });

  assert.equal(tickResult.ok, true, "tick ok");
  assert.ok(tickResult.ran >= 1, "obligations ran");
  const run = tickResult.results.find(r => r.id === obligation.id);
  assert.ok(run, "our cogentia obligation ran");
  assert.equal(run.ok, true, "run executed successfully");
  assert.ok(run.evidence, "evidence present");
  assert.ok(["cli", "daemon", "stigmergic"].includes(run.evidence.mode), "valid execution mode");

  // 4. Verify durable COP Event log in SQLite
  const events = listCopEvents(db, { limit: 10 });
  const evidenceEvent = events.find(e => e.kind === COP_CALENDAR_KINDS.EVIDENCE);
  assert.ok(evidenceEvent, "cop/evidence event recorded in durable log");

  console.log(JSON.stringify({
    ok: true,
    test: "calendarCogentiaWakeIntegration",
    dispatched_job: "corpus.sleep_cycle",
    execution_mode: run.evidence.mode,
    evidence_recorded: Boolean(evidenceEvent),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
