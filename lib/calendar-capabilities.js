import { toIcs } from "./calendar.js";
import { buildNodeCalendar } from "./node-agent/calendar-view.js";
import { runDueCalendarObligations } from "./node-agent/calendar-runner.js";
import { upsertDnsWatch, upsertWakePacket } from "./node-agent/calendar-store.js";

/**
 * Shared calendar capabilities. HTTP, COP, and the CLI all call these.
 * They do not choose a transport.
 */
export function listCalendar(deps = {}) {
  return buildNodeCalendar({
    config: deps.config,
    db: deps.db,
    nodeId: deps.nodeId || deps.config?.nodeId,
    hostname: deps.hostname || deps.config?.hostname,
    now: deps.now,
    service: deps.service,
    project: deps.project,
    status: deps.status,
    kind: deps.kind,
    node: deps.node,
  });
}

export function scheduleCalendar(deps, packet) {
  const stored = upsertWakePacket(deps.db, packet, {
    node_id: deps.nodeId || deps.config?.nodeId,
    hostname: deps.hostname || deps.config?.hostname,
    now: deps.now,
  });
  return {
    schema: "operium.calendar.schedule.v1",
    ok: true,
    authorized: false,
    packet_type: "cop/node.wake.v1",
    obligation: stored,
  };
}

export function watchDnsCalendar(deps, spec = {}) {
  const stored = upsertDnsWatch(deps.db, spec, {
    node_id: deps.nodeId || deps.config?.nodeId || spec.target_node,
    hostname: deps.hostname || deps.config?.hostname,
    now: deps.now || spec.now,
  });
  return {
    schema: "operium.calendar.watch.v1",
    ok: true,
    created: true,
    authorized: false,
    obligation: stored,
  };
}

export async function tickCalendar(deps, options = {}) {
  const result = await runDueCalendarObligations(deps.db, {
    now: deps.now || options.now,
    fetch: options.fetch,
    resolver: options.resolver,
    log: options.log,
  });
  return {
    ...result,
    projection: listCalendar(deps),
  };
}

export function icsCalendar(deps, options = {}) {
  return toIcs(listCalendar(deps), { name: options.name || "FractaCalendar" });
}
