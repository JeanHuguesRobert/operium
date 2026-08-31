#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  buildCalendarProjection,
  computeNextRun,
  dnsWatchObligation,
  evaluateEscalation,
  evaluateStopCondition,
  obligationFromScheduledJob,
  toIcs,
} from "../lib/calendar.js";
import { loadOnaConfig } from "../lib/node-agent/config.js";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import { createOnaHttpServer } from "../lib/node-agent/http-server.js";
import { LATEST_SCHEMA_VERSION } from "../lib/node-agent/migrate.js";
import { syncScheduledJobs } from "../lib/node-agent/job-scheduler.js";
import { upsertDnsWatch, getCalendarObligation } from "../lib/node-agent/calendar-store.js";
import { runDueCalendarObligations } from "../lib/node-agent/calendar-runner.js";
import { comparableWakeItems, replayCalendarObligations } from "../lib/node-agent/calendar-replay.js";
import { COP_CALENDAR_KINDS, listCopEvents } from "../lib/node-agent/cop-events.js";
import { buildNodeCalendar } from "../lib/node-agent/calendar-view.js";
import { checkDnsDelegation } from "../lib/node-agent/dns-watch.js";
import { formatCalendarHuman } from "../lib/format-calendar-human.js";
import { runCalendarCommand } from "../lib/calendar-cli.js";
import { runNodeCliCommand } from "../lib/node-cli.js";
import { dnsObservationWakePacket, obligationFromWakePacket, parseWakePacket } from "../lib/cop-wake.js";
import { fileURLToPath } from "node:url";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-calendar-"));
const dbPath = path.join(tmpDir, "node_memory.sqlite");
const now = "2026-08-31T12:00:00.000Z";

const job = {
  job_id: "heartbeat:operium-node",
  kind: "ona.heartbeat",
  interval_ms: 180000,
  enabled: true,
  last_run_at: "2026-08-31T11:57:00.000Z",
  last_ok: true,
  last_error: null,
  next_run_at: "2026-08-31T12:00:00.000Z",
  run_count: 4,
  config: { env_files: ["/secret/path.env"], script: "unused" },
};

const fromJob = obligationFromScheduledJob(job, { node_id: "resource://fracta" });
assert.equal(fromJob.schema, "operium.calendar.obligation.v1");
assert.equal(fromJob.source_of_truth, "scheduled_jobs:heartbeat:operium-node");
assert.equal(fromJob.calendar_origin, "catalogue");
assert.equal(fromJob.authorized, false);
assert.equal(fromJob.executes, true);
assert.equal(fromJob.service, "ona");
assert.equal(fromJob.config.env_files, undefined);
assert.equal(fromJob.config.env_files_count, 1);

assert.equal(evaluateStopCondition({ type: "none" }, { matched: true }).met, false);
assert.equal(evaluateStopCondition({ type: "nameservers_match" }, { matched: true }).met, true);
assert.equal(evaluateStopCondition({ type: "always" }, {}).met, true);

const first = computeNextRun({
  cadence: { kind: "after_first", first_delay_ms: 3600000, interval_ms: 10800000 },
  earliest_at: "2026-08-31T13:00:00.000Z",
  run_count: 0,
  now,
});
assert.equal(first, "2026-08-31T13:00:00.000Z");
const next = computeNextRun({
  cadence: { kind: "after_first", first_delay_ms: 3600000, interval_ms: 10800000 },
  last_run_at: now,
  run_count: 1,
  now,
});
assert.equal(next, "2026-08-31T15:00:00.000Z");

const watchSpec = dnsWatchObligation({
  domain: "acorsica.org",
  expected_ns: ["bob.ns.cloudflare.com.", "Ada.ns.cloudflare.com"],
  first_delay_ms: 3600000,
  interval_ms: 10800000,
  escalate_after_ms: 86400000,
  now,
}, { node_id: "resource://fracta" });
assert.equal(watchSpec.id, "dns-delegation:acorsica.org");
assert.deepEqual(watchSpec.config.expected_ns, ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"]);
assert.equal(watchSpec.stop_condition.type, "nameservers_match");
assert.equal(watchSpec.authorized, false);
assert.equal(evaluateEscalation({ ...watchSpec, status: "active" }, "2026-09-01T12:00:00.000Z").escalated, true);

const { db, migration } = openNodeMemoryDb({
  dbPath,
  nodeId: "resource://fracta",
  hostname: "fracta",
});
assert.equal(migration.latest, LATEST_SCHEMA_VERSION);
assert.ok(migration.applied.includes(4));
assert.ok(migration.applied.includes(5));

syncScheduledJobs(db, [job]);
upsertDnsWatch(db, {
  domain: "acorsica.org",
  expected_ns: ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"],
  first_delay_ms: 0,
  interval_ms: 10800000,
  now,
  target_node: "resource://fracta",
}, { node_id: "resource://fracta", hostname: "fracta", now });

const diverge = await runDueCalendarObligations(db, {
  now,
  resolver: async () => ["ns1.gandi.net", "ns2.gandi.net"],
});
assert.equal(diverge.ran, 1);
assert.equal(diverge.results[0].closed, false);
assert.equal(getCalendarObligation(db, "dns-delegation:acorsica.org").status, "active");

const later = "2026-09-01T13:00:00.000Z";
const escalated = await runDueCalendarObligations(db, {
  now: later,
  resolver: async () => ["ns1.gandi.net", "ns2.gandi.net"],
});
assert.equal(escalated.results[0].status, "escalated");
assert.equal(escalated.results[0].closed, false);

const closed = await runDueCalendarObligations(db, {
  now: "2026-09-01T16:00:00.000Z",
  resolver: async () => ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"],
});
assert.equal(closed.results[0].closed, true);
assert.equal(getCalendarObligation(db, "dns-delegation:acorsica.org").status, "closed");
assert.equal(getCalendarObligation(db, "dns-delegation:acorsica.org").next_run_at, null);

const storedProjection = buildNodeCalendar({
  db,
  config: { nodeId: "resource://fracta", hostname: "fracta" },
  nodeId: "resource://fracta",
  now,
});
const storedWakeItems = comparableWakeItems(storedProjection);
assert.equal(storedWakeItems.length, 1);
assert.equal(storedWakeItems[0].status, "closed");
assert.equal(storedWakeItems[0].calendar_origin, "wake");
const liveEvents = listCopEvents(db, { obligation_id: "dns-delegation:acorsica.org", order: "asc" });
assert.ok(liveEvents.some(event => event.kind === COP_CALENDAR_KINDS.WAKE));
assert.ok(liveEvents.some(event => event.kind === COP_CALENDAR_KINDS.EVIDENCE));
assert.ok(liveEvents.some(event => event.kind === COP_CALENDAR_KINDS.CLOSE));
assert.ok(liveEvents.some(event => event.kind === COP_CALENDAR_KINDS.ESCALATE));
replayCalendarObligations(db, { node_id: "resource://fracta", hostname: "fracta" });
const replayedProjection = buildNodeCalendar({
  db,
  config: { nodeId: "resource://fracta", hostname: "fracta" },
  nodeId: "resource://fracta",
  now,
});
assert.deepEqual(comparableWakeItems(replayedProjection), storedWakeItems);
assert.ok(replayedProjection.items.some(item => item.id === "job:heartbeat:operium-node" && item.calendar_origin === "catalogue"));
assert.equal(
  listCopEvents(db, { obligation_id: "job:heartbeat:operium-node" }).length,
  0,
);

const idle = await runDueCalendarObligations(db, { now: "2026-09-01T19:00:00.000Z" });
assert.equal(idle.ran, 0);

const projection = buildNodeCalendar({
  db,
  config: { nodeId: "resource://fracta", hostname: "fracta" },
  nodeId: "resource://fracta",
  now,
});
assert.equal(projection.schema, "operium.calendar.projection.v1");
assert.equal(projection.not_an_executor, true);
assert.equal(projection.personal_calendar.personal_calendar_is_executor, false);
assert.ok(projection.items.some(item => item.id === "job:heartbeat:operium-node"));
assert.ok(projection.items.some(item => item.id === "dns-delegation:acorsica.org"));
assert.ok(projection.views.by_service.ona.includes("job:heartbeat:operium-node"));
assert.ok(projection.views.by_project["acorsica.org"].includes("dns-delegation:acorsica.org"));
assert.ok(projection.views.by_service.dns.includes("dns-delegation:acorsica.org"));

const ics = toIcs(projection);
assert.match(ics, /X-OPERIUM-NOT-EXECUTOR:1/);
assert.match(ics, /dns-delegation:acorsica.org/);
assert.match(ics, /Projection only/);

const human = formatCalendarHuman(projection);
assert.match(human, /FractaCalendar/);
assert.match(human, /does not authorize/);

const filtered = buildCalendarProjection({
  jobs: [job],
  obligations: [watchSpec],
  nodeId: "resource://fracta",
  service: "dns",
});
assert.equal(filtered.items.length, 1);
assert.equal(filtered.items[0].kind, "dns.watch");

const doh = await checkDnsDelegation({
  domain: "example.org",
  expected_ns: ["a.ns.example", "b.ns.example"],
  fetch: async () => ({
    ok: true,
    json: async () => ({
      Answer: [
        { type: 2, data: "b.ns.example." },
        { type: 2, data: "a.ns.example." },
      ],
    }),
  }),
});
assert.equal(doh.matched, true);

const config = loadOnaConfig({
  ONA_COP_DELIVERY: "0",
  ONA_BIND: "127.0.0.1",
  ONA_HOSTNAME: "fracta",
  ONA_NODE_ID: "resource://fracta",
  ONA_READ_TOKEN: "cal-read",
  ONA_ADMIN_TOKEN: "cal-admin",
});
const server = createOnaHttpServer({
  config,
  db,
  startedAt: now,
  getNodeId: () => "resource://fracta",
});
const port = await listenEphemeral(server);
const baseUrl = `http://127.0.0.1:${port}`;

const remote = await runNodeCliCommand({
  subcommand: "calendar",
  url: baseUrl,
  token: "cal-read",
});
assert.equal(remote.ok, true);
assert.equal(remote.body.schema, "operium.calendar.projection.v1");
assert.ok(remote.body.items.some(item => item.id === "dns-delegation:acorsica.org"));

const denied = await fetchJson(`${baseUrl}/node/calendar`);
assert.equal(denied.status, 401);

const watchDenied = await postJson(`${baseUrl}/node/calendar/watch`, { domain: "x.test" }, "cal-read");
assert.equal(watchDenied.status, 401);

const created = await postJson(`${baseUrl}/node/calendar/watch`, {
  domain: "example.test",
  expected_ns: ["ns1.example.test"],
  first_delay_ms: 0,
  now,
}, "cal-admin");
assert.equal(created.status, 200);
assert.equal(created.body.authorized, false);
assert.equal(created.body.obligation.kind, "observation.dns.delegation");
assert.equal(created.body.obligation.config.wake.packet_type, "cop/node.wake.v1");

const viaNodeHttp = await runNodeCliCommand({
  subcommand: "calendar",
  url: baseUrl,
  token: "cal-read",
});
const viaCliHttp = await runCalendarCommand({
  subcommand: "list",
  url: baseUrl,
  token: "cal-read",
});
assert.equal(viaCliHttp.body.schema, "operium.calendar.projection.v1");
assert.deepEqual(
  viaCliHttp.body.items.map(item => item.id).sort(),
  viaNodeHttp.body.items.map(item => item.id).sort(),
);

const exampleForHttp = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../examples/cop-node-wake.dns-observation.json",
);
const viaScheduleHttp = await runCalendarCommand({
  subcommand: "schedule",
  file: exampleForHttp,
  url: baseUrl,
  token: "cal-admin",
});
assert.equal(viaScheduleHttp.body.schema, "operium.calendar.schedule.v1");
assert.equal(viaScheduleHttp.body.packet_type, "cop/node.wake.v1");
assert.equal(viaScheduleHttp.body.authorized, false);

const missingRef = await postJson(`${baseUrl}/node/calendar/schedule`, {
  id: "cop:wake:missing-ref",
  packet_type: "cop/node.wake.v1",
  payload: {
    schema: "cop/node.wake.v1",
    authorized: false,
    packet_ref: "continuation:does-not-exist",
  },
}, "cal-admin");
assert.equal(missingRef.status, 400);
assert.equal(missingRef.body.error, "packet_ref_unreadable");

db.close();
await new Promise(resolve => server.close(resolve));

const cliDb = path.join(tmpDir, "cli.sqlite");
const env = {
  ONA_COP_DELIVERY: "0",
  ONA_HOSTNAME: "cli-cal",
  ONA_NODE_ID: "resource://cli-cal",
  ONA_DB_PATH: cliDb,
};
const watched = await runCalendarCommand({
  subcommand: "watch",
  watchKind: "dns",
  domain: "acorsica.org",
  expectedNs: "ada.ns.cloudflare.com,bob.ns.cloudflare.com",
  firstDelayMs: 0,
  intervalMs: 1000,
  now,
  env,
  dbPath: cliDb,
});
assert.equal(watched.body.obligation.id, "dns-delegation:acorsica.org");
assert.equal(watched.body.obligation.kind, "observation.dns.delegation");

const exampleWake = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../examples/cop-node-wake.dns-observation.json",
);
const parsedExample = parseWakePacket(JSON.parse(fs.readFileSync(exampleWake, "utf8")));
assert.equal(parsedExample.ok, true);
assert.equal(parsedExample.envelope.payload.packet.envelope.packet_kind, "observation");
const fromExample = obligationFromWakePacket(JSON.parse(fs.readFileSync(exampleWake, "utf8")));
assert.equal(fromExample.kind, "observation.dns.delegation");
assert.match(fromExample.source_of_truth, /^cop\/node\.wake\.v1:/);

const sugar = dnsObservationWakePacket({
  domain: "acorsica.org",
  expected_ns: ["ada.ns.cloudflare.com"],
  first_delay_ms: 0,
  now,
});
assert.equal(sugar.packet_type, "cop/node.wake.v1");
assert.equal(sugar.payload.packet.payload.kind, "observation.dns.delegation");

const scheduled = await runCalendarCommand({
  subcommand: "schedule",
  file: exampleWake,
  now,
  env,
  dbPath: cliDb,
});
assert.equal(scheduled.body.packet_type, "cop/node.wake.v1");
assert.equal(scheduled.body.authorized, false);
assert.equal(scheduled.body.obligation.kind, "observation.dns.delegation");

const listed = await runCalendarCommand({
  subcommand: "list",
  env,
  dbPath: cliDb,
  now,
});
assert.ok(listed.body.items.some(item => item.id === "dns-delegation:acorsica.org"));

const icsResult = await runCalendarCommand({
  subcommand: "ics",
  env,
  dbPath: cliDb,
});
assert.match(icsResult.ics, /X-OPERIUM-NOT-EXECUTOR:1/);

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  tests: [
    "job_projection",
    "stop_condition",
    "cadence",
    "dns_watch_model",
    "dns_watch_diverge_escalate_close",
    "projection_views",
    "ics_not_executor",
    "doh_check",
    "http_calendar",
    "cli_http_list_and_schedule",
    "cli_watch_list_ics",
    "cop_wake_packet_schedule",
    "packet_ref_unreadable_http_400",
    "cop_event_log_replay",
  ],
}, null, 2));

function listenEphemeral(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("invalid_listen_address"));
        return;
      }
      resolve(address.port);
    });
    server.on("error", reject);
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body || "{}") });
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function postJson(url, payload, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        Authorization: `Bearer ${token}`,
      },
    }, (res) => {
      let body = "";
      res.on("data", chunk => { body += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body || "{}") });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}
