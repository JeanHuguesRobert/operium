#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { continuationWakePacket, dnsObservationWakePacket, obligationFromWakePacket, parseWakePacket } from "../lib/cop-wake.js";
import { listCalendar, resolveCalendar, scheduleCalendar, tickCalendar } from "../lib/calendar-capabilities.js";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import { LATEST_SCHEMA_VERSION } from "../lib/node-agent/migrate.js";
import { getCalendarObligation, upsertCalendarObligation } from "../lib/node-agent/calendar-store.js";
import { backfillWakeEventsFromObligations, comparableWakeItems, replayCalendarObligations } from "../lib/node-agent/calendar-replay.js";
import { COP_CALENDAR_KINDS, listCopEvents } from "../lib/node-agent/cop-events.js";
import { handleCopHttpRequest } from "../lib/node-agent/cop-handler.js";
import { COP_NODE_PACKETS } from "../lib/node-agent/envelope.js";
import { runTtlSweeper } from "../lib/node-agent/ttl-sweeper.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-calendar-events-"));
const dbPath = path.join(tmpDir, "node_memory.sqlite");
const now = "2026-08-31T12:00:00.000Z";
const { db, migration } = openNodeMemoryDb({
  dbPath,
  nodeId: "resource://fracta",
  hostname: "fracta",
});
assert.equal(migration.latest, LATEST_SCHEMA_VERSION);
assert.ok(migration.applied.includes(5));

const deps = {
  db,
  config: { nodeId: "resource://fracta", hostname: "fracta" },
  nodeId: "resource://fracta",
  hostname: "fracta",
  now,
};

const example = JSON.parse(fs.readFileSync(path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../examples/cop-node-wake.dns-observation.json",
), "utf8"));
example.payload.due_at = now;
example.payload.cadence = { kind: "after_first", first_delay_ms: 0, interval_ms: 10800000 };
example.payload.deadline = "2026-09-01T12:00:00.000Z";

const scheduled = scheduleCalendar(deps, example);
assert.equal(scheduled.obligation.calendar_origin, "wake");
assert.equal(scheduled.authorized, false);

const diverge = await tickCalendar(deps, {
  now,
  resolver: async () => ["ns1.gandi.net", "ns2.gandi.net"],
});
assert.equal(diverge.results[0].closed, false);

const closed = await tickCalendar({ ...deps, now: "2026-09-01T16:00:00.000Z" }, {
  now: "2026-09-01T16:00:00.000Z",
  resolver: async () => ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"],
});
assert.equal(closed.results[0].closed, true);

const live = listCalendar(deps);
const liveWakes = comparableWakeItems(live);
assert.equal(liveWakes[0].status, "closed");
assert.equal(liveWakes[0].run_count, 2);

replayCalendarObligations(db, { node_id: "resource://fracta", hostname: "fracta" });
assert.deepEqual(comparableWakeItems(listCalendar(deps)), liveWakes);

const continuationFile = JSON.parse(fs.readFileSync(path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../examples/cop-node-wake.continuation.json",
), "utf8"));
continuationFile.payload.due_at = now;
const parsedContinuation = parseWakePacket(continuationFile);
assert.equal(parsedContinuation.envelope.payload.packet.envelope.packet_kind, "continuation");
assert.equal(parsedContinuation.envelope.payload.authorized, false);

const continued = scheduleCalendar(deps, continuationWakePacket({
  id: "continuation:example-judgment",
  question: "Should this wake resolve?",
  due_at: now,
  now,
  cadence: { kind: "once" },
}, { hostname: "fracta" }));
assert.equal(continued.authorized, false);
assert.equal(continued.obligation.kind, "continuation.judgment");
assert.equal(continued.obligation.calendar_origin, "wake");
assert.equal(continued.obligation.service, "continuation");

const ticked = await tickCalendar(deps, { now });
const continuationResult = ticked.results.find(item => item.id === "continuation:example-judgment");
assert.ok(continuationResult);
assert.equal(continuationResult.closed, false);
assert.equal(continuationResult.evidence.pending, true);
assert.equal(continuationResult.evidence.authorized, false);
assert.equal(continuationResult.evidence.message, "continuation_awaits_judgment");

const afterTick = listCalendar(deps);
const continuationItem = afterTick.items.find(item => item.id === "continuation:example-judgment");
assert.equal(continuationItem.status, "active");
assert.equal(continuationItem.authorized, false);
assert.equal(continuationItem.last_evidence.pending, true);

const continuationEvents = listCopEvents(db, { obligation_id: "continuation:example-judgment" });
assert.ok(continuationEvents.some(event => event.kind === COP_CALENDAR_KINDS.WAKE));
assert.ok(continuationEvents.some(event => event.kind === COP_CALENDAR_KINDS.EVIDENCE));
assert.equal(continuationEvents.filter(event => event.kind === COP_CALENDAR_KINDS.CLOSE).length, 0);

const query = await handleCopHttpRequest({
  id: "cop:query-cop-events-1",
  packet_type: COP_NODE_PACKETS.QUERY,
  sender: { node_id: "resource://i7-thinkpad-jhr" },
  payload: { query: "cop_events", obligation_id: "continuation:example-judgment", limit: 20 },
}, {
  config: deps.config,
  db,
  nodeId: "resource://fracta",
});
assert.equal(query.status, 200);
assert.equal(query.body.response_envelope.payload.query, "cop_events");
assert.ok(query.body.response_envelope.payload.events.length >= 2);

assert.throws(
  () => scheduleCalendar(deps, {
    id: "cop:wake:missing-ref",
    packet_type: "cop/node.wake.v1",
    payload: {
      schema: "cop/node.wake.v1",
      authorized: false,
      packet_ref: "continuation:does-not-exist",
    },
  }),
  (error) => error.message === "packet_ref_unreadable",
);

const packetRefFile = JSON.parse(fs.readFileSync(path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../examples/cop-node-wake.packet-ref.json",
), "utf8"));
packetRefFile.payload.due_at = now;
const byRef = scheduleCalendar(deps, packetRefFile);
assert.equal(byRef.authorized, false);
assert.equal(byRef.obligation.kind, "continuation.judgment");
assert.equal(byRef.obligation.id, "continuation:example-judgment:by-ref");
assert.equal(byRef.obligation.config.wake.payload.packet_ref, "continuation:example-judgment");

assert.throws(
  () => resolveCalendar(deps, {
    id: "cop:resolve-dns-1",
    packet_type: COP_NODE_PACKETS.RESOLVE,
    payload: { obligation_id: scheduled.obligation.id, decision: "resolved" },
  }),
  (error) => error.message === "resolve_requires_continuation",
);

const held = resolveCalendar(deps, {
  id: "cop:resolve-hold-1",
  packet_type: COP_NODE_PACKETS.RESOLVE,
  sender: { node_id: "resource://i7-thinkpad-jhr" },
  payload: {
    schema: "cop/node.resolve.v1",
    obligation_id: "continuation:example-judgment",
    decision: "resolved",
    authorized: false,
    step_result: {
      type: "step_result",
      continuation_id: "continuation:example-judgment",
      status: "needs_acceptance",
      reason: "No mandate to close",
    },
  },
});
assert.equal(held.authorized, false);
assert.equal(held.closed, false);
assert.equal(held.obligation.status, "active");
assert.equal(held.obligation.last_evidence.pending, true);
assert.equal(held.obligation.last_evidence.hitl, true);
assert.equal(held.obligation.last_evidence.decision, "resolved");

const peerResolve = await handleCopHttpRequest({
  id: "cop:resolve-peer-denied",
  packet_type: COP_NODE_PACKETS.RESOLVE,
  payload: {
    obligation_id: "continuation:example-judgment",
    decision: "cancelled",
  },
}, {
  config: deps.config,
  db,
  nodeId: "resource://fracta",
  adminAuth: false,
});
assert.equal(peerResolve.status, 401);
assert.equal(peerResolve.body.error, "unauthorized_admin");
assert.equal(getCalendarObligation(db, "continuation:example-judgment").status, "active");

const resolveFile = JSON.parse(fs.readFileSync(path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../examples/cop-node-resolve.continuation.json",
), "utf8"));
const copResolve = await handleCopHttpRequest(resolveFile, {
  config: deps.config,
  db,
  nodeId: "resource://fracta",
  adminAuth: true,
});
assert.equal(copResolve.status, 200);
assert.equal(copResolve.body.handler, "resolve");
assert.equal(copResolve.body.response_envelope.payload.authorized, false);
assert.equal(copResolve.body.response_envelope.payload.closed, true);
assert.equal(copResolve.body.response_envelope.payload.obligation.status, "closed");

const afterResolve = listCalendar(deps);
const resolvedItem = afterResolve.items.find(item => item.id === "continuation:example-judgment");
assert.equal(resolvedItem.status, "closed");
assert.equal(resolvedItem.authorized, false);
assert.equal(resolvedItem.last_evidence.hitl, true);
assert.equal(resolvedItem.last_evidence.pending, false);

const resolvedEvents = listCopEvents(db, { obligation_id: "continuation:example-judgment" });
assert.ok(resolvedEvents.some(event => event.kind === COP_CALENDAR_KINDS.RESOLVE));
assert.ok(resolvedEvents.some(event => event.kind === COP_CALENDAR_KINDS.CLOSE));

const liveAfterResolve = comparableWakeItems(listCalendar(deps));
replayCalendarObligations(db, { node_id: "resource://fracta", hostname: "fracta" });
assert.deepEqual(comparableWakeItems(listCalendar(deps)), liveAfterResolve);

const afterReplayTick = await tickCalendar(deps, { now });
assert.equal(
  afterReplayTick.results.some(item => item.id === "continuation:example-judgment"),
  false,
);

const beforeSweep = listCopEvents(db).length;
assert.ok(beforeSweep >= 2);
runTtlSweeper(db, { now: new Date("2030-01-01T00:00:00.000Z") });
assert.equal(listCopEvents(db).length, beforeSweep);

const legacyPath = path.join(tmpDir, "legacy.sqlite");
const { db: legacyDb } = openNodeMemoryDb({
  dbPath: legacyPath,
  nodeId: "resource://fracta",
  hostname: "fracta",
  backfillCopEvents: false,
});
const legacyWake = dnsObservationWakePacket({
  domain: "legacy.test",
  expected_ns: ["ns1.legacy.test"],
  first_delay_ms: 0,
  now,
}, { node_id: "resource://fracta", hostname: "fracta" });
upsertCalendarObligation(
  legacyDb,
  obligationFromWakePacket(legacyWake, { node_id: "resource://fracta", hostname: "fracta" }),
  { node_id: "resource://fracta", hostname: "fracta", now },
);
assert.equal(listCopEvents(legacyDb).length, 0);
const filled = backfillWakeEventsFromObligations(legacyDb, { now });
assert.equal(filled.created, 1);
const legacyDeps = {
  db: legacyDb,
  config: { nodeId: "resource://fracta", hostname: "fracta" },
  nodeId: "resource://fracta",
  hostname: "fracta",
  now,
};
const legacyLive = comparableWakeItems(listCalendar(legacyDeps));
replayCalendarObligations(legacyDb, { node_id: "resource://fracta", hostname: "fracta" });
assert.deepEqual(comparableWakeItems(listCalendar(legacyDeps)), legacyLive);
legacyDb.close();

db.close();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  tests: [
    "event_append_replay_matches_projection",
    "catalogue_jobs_are_not_wake_packets",
    "continuation_wake_handler_unauthorized",
    "cop_events_query",
    "packet_ref_unreadable_fails_closed",
    "packet_ref_wake_from_registered_packet",
    "resolve_rejects_non_continuation",
    "resolve_needs_acceptance_overrides_decision",
    "resolve_requires_admin_auth",
    "cop_resolve_hitl_closes_unauthorized",
    "resolve_replay_matches_projection",
    "closed_continuation_not_due",
    "cop_events_not_ttl_swept",
    "backfill_pre_event_log_obligations",
  ],
}, null, 2));
