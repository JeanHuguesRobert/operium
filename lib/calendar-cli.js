import fs from "node:fs";
import { toIcs } from "./calendar.js";
import { openNodeMemoryDb } from "./node-agent/db.js";
import { loadOnaConfig } from "./node-agent/config.js";
import { buildNodeCalendar } from "./node-agent/calendar-view.js";
import { runDueCalendarObligations } from "./node-agent/calendar-runner.js";
import { getCalendarObligation, upsertDnsWatch, upsertWakePacket } from "./node-agent/calendar-store.js";
import { fetchOnaEndpoint } from "./node-cli.js";

export async function runCalendarCommand(options = {}) {
  const sub = options.subcommand || "list";
  if (sub === "list" || sub === "project" || sub === "ics") {
    const projection = options.url
      ? await fetchRemoteCalendar(options)
      : buildLocalCalendar(options);
    if (sub === "ics" || options.format === "ics") {
      return {
        ok: true,
        body: projection,
        ics: toIcs(projection, { name: "FractaCalendar" }),
      };
    }
    return { ok: true, body: projection };
  }

  if (sub === "schedule") {
    return runScheduleCommand(options);
  }

  if (sub === "watch") {
    return runWatchCommand(options);
  }

  if (sub === "tick") {
    const { db, config } = openLocalCalendarDb(options);
    try {
      const result = await runDueCalendarObligations(db, {
        now: options.now,
        fetch: options.fetch,
        resolver: options.resolver,
      });
      const projection = buildNodeCalendar({
        db,
        config,
        nodeId: config.nodeId,
        now: options.now,
      });
      return { ok: true, body: { ...result, projection } };
    } finally {
      db.close();
    }
  }

  throw new Error(`unknown_calendar_subcommand: ${sub}`);
}

function buildLocalCalendar(options = {}) {
  const { db, config } = openLocalCalendarDb(options);
  try {
    return buildNodeCalendar({
      db,
      config,
      nodeId: config.nodeId,
      now: options.now,
      service: options.service,
      project: options.project,
      status: options.filterStatus,
      kind: options.filterKind,
    });
  } finally {
    db.close();
  }
}

async function fetchRemoteCalendar(options) {
  const result = await fetchOnaEndpoint("/node/calendar", options);
  if (!result.ok) {
    throw new Error(result.error || "ona_calendar_request_failed");
  }
  return result.body;
}

function runScheduleCommand(options = {}) {
  const file = String(options.file || "").trim();
  if (!file) throw new Error("calendar schedule requires --file <wake-packet.json>");
  const raw = fs.readFileSync(file, "utf8");
  const body = JSON.parse(raw);
  const { db, config } = openLocalCalendarDb(options);
  try {
    const stored = upsertWakePacket(db, body, {
      node_id: config.nodeId,
      hostname: config.hostname,
      now: options.now,
    });
    return {
      ok: true,
      body: {
        schema: "operium.calendar.schedule.v1",
        authorized: false,
        packet_type: "cop/node.wake.v1",
        obligation: stored,
      },
    };
  } finally {
    db.close();
  }
}

function runWatchCommand(options = {}) {
  const kind = String(options.watchKind || options.kind || "dns").trim().toLowerCase();
  if (kind !== "dns" && kind !== "dns.watch") {
    throw new Error("calendar watch currently supports dns only");
  }
  const domain = String(options.domain || "").trim().toLowerCase();
  const expected = options.expectedNs;
  const { db, config } = openLocalCalendarDb(options);
  try {
    const stored = upsertDnsWatch(db, {
      domain,
      expected_ns: expected,
      first_delay_ms: options.firstDelayMs,
      interval_ms: options.intervalMs,
      escalate_after_ms: options.escalateAfterMs,
      deadline: options.deadline,
      now: options.now,
      target_node: config.nodeId,
    }, {
      node_id: config.nodeId,
      hostname: config.hostname,
      now: options.now,
    });
    return {
      ok: true,
      body: {
        schema: "operium.calendar.watch.v1",
        created: true,
        authorized: false,
        obligation: stored || getCalendarObligation(db, `dns-delegation:${domain}`),
      },
    };
  } finally {
    db.close();
  }
}

function openLocalCalendarDb(options = {}) {
  const env = { ...(options.env || process.env) };
  // Local projection reads SQLite only; COP delivery is not required.
  const config = loadOnaConfig({ ...env, ONA_COP_DELIVERY: "0" });
  const { db } = openNodeMemoryDb({
    dbPath: options.dbPath,
    env,
    nodeId: config.nodeId,
    hostname: config.hostname,
  });
  return { db, config };
}
