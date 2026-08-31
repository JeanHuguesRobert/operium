import fs from "node:fs";
import { toIcs } from "./calendar.js";
import { openNodeMemoryDb } from "./node-agent/db.js";
import { loadOnaConfig } from "./node-agent/config.js";
import {
  listCalendar,
  scheduleCalendar,
  tickCalendar,
  watchDnsCalendar,
} from "./calendar-capabilities.js";
import { fetchOnaEndpoint } from "./node-cli.js";

export async function runCalendarCommand(options = {}) {
  const sub = options.subcommand || "list";
  const local = useLocalStore(options);

  if (sub === "list" || sub === "project" || sub === "ics") {
    const projection = local
      ? withLocalDb(options, deps => listCalendar({ ...deps, ...listFilters(options) }))
      : await fetchCalendarHttp(options);
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
    return local ? runScheduleLocal(options) : runScheduleHttp(options);
  }

  if (sub === "watch") {
    return local ? runWatchLocal(options) : runWatchHttp(options);
  }

  if (sub === "tick") {
    if (local) {
      return withLocalDbAsync(options, async deps => {
        const body = await tickCalendar(deps, {
          now: options.now,
          fetch: options.fetch,
          resolver: options.resolver,
        });
        return { ok: true, body };
      });
    }
    const result = await fetchOnaEndpoint("/node/calendar/tick", {
      ...options,
      method: "POST",
      json: {},
    });
    if (!result.ok) throw new Error(result.error || "ona_calendar_tick_failed");
    return { ok: true, body: result.body };
  }

  throw new Error(`unknown_calendar_subcommand: ${sub}`);
}

function useLocalStore(options = {}) {
  return Boolean(options.dbPath || options.local);
}

function listFilters(options = {}) {
  return {
    service: options.service,
    project: options.project,
    status: options.filterStatus,
    kind: options.filterKind,
    now: options.now,
  };
}

async function fetchCalendarHttp(options) {
  const result = await fetchOnaEndpoint("/node/calendar", {
    ...options,
    ...listFilters(options),
  });
  if (!result.ok) throw new Error(result.error || "ona_calendar_request_failed");
  return result.body;
}

function runScheduleLocal(options = {}) {
  const packet = readSchedulePacket(options);
  return withLocalDb(options, deps => ({
    ok: true,
    body: scheduleCalendar(deps, packet),
  }));
}

async function runScheduleHttp(options = {}) {
  const packet = readSchedulePacket(options);
  const result = await fetchOnaEndpoint("/node/calendar/schedule", {
    ...options,
    method: "POST",
    json: packet,
  });
  if (!result.ok) throw new Error(result.error || "ona_calendar_schedule_failed");
  return { ok: true, body: result.body };
}

function runWatchLocal(options = {}) {
  const spec = watchSpec(options);
  return withLocalDb(options, deps => ({
    ok: true,
    body: watchDnsCalendar(deps, spec),
  }));
}

async function runWatchHttp(options = {}) {
  const spec = watchSpec(options);
  const result = await fetchOnaEndpoint("/node/calendar/watch", {
    ...options,
    method: "POST",
    json: spec,
  });
  if (!result.ok) throw new Error(result.error || "ona_calendar_watch_failed");
  return { ok: true, body: result.body };
}

function readSchedulePacket(options = {}) {
  const file = String(options.file || "").trim();
  if (!file) throw new Error("calendar schedule requires --file <wake-packet.json>");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function watchSpec(options = {}) {
  const kind = String(options.watchKind || options.kind || "dns").trim().toLowerCase();
  if (kind !== "dns" && kind !== "dns.watch") {
    throw new Error("calendar watch currently supports dns only");
  }
  const domain = String(options.domain || "").trim().toLowerCase();
  return {
    domain,
    expected_ns: options.expectedNs,
    first_delay_ms: options.firstDelayMs,
    interval_ms: options.intervalMs,
    escalate_after_ms: options.escalateAfterMs,
    deadline: options.deadline,
    now: options.now,
  };
}

function withLocalDb(options, fn) {
  const { db, config } = openLocalCalendarDb(options);
  try {
    return fn({
      db,
      config,
      nodeId: config.nodeId,
      hostname: config.hostname,
      now: options.now,
    });
  } finally {
    db.close();
  }
}

async function withLocalDbAsync(options, fn) {
  const { db, config } = openLocalCalendarDb(options);
  try {
    return await fn({
      db,
      config,
      nodeId: config.nodeId,
      hostname: config.hostname,
      now: options.now,
    });
  } finally {
    db.close();
  }
}

function openLocalCalendarDb(options = {}) {
  const env = { ...(options.env || process.env) };
  const config = loadOnaConfig({ ...env, ONA_COP_DELIVERY: "0" });
  const { db } = openNodeMemoryDb({
    dbPath: options.dbPath,
    env,
    nodeId: config.nodeId,
    hostname: config.hostname,
  });
  return { db, config };
}

export { listCalendar, scheduleCalendar, tickCalendar, watchDnsCalendar } from "./calendar-capabilities.js";
