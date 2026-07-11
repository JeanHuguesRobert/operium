import { listEventLog } from "./event-log.js";

export function parseLogsQuery(searchParams = {}) {
  const limit = Math.min(Math.max(Number(searchParams.get?.("limit") ?? searchParams.limit ?? 20), 1), 200);
  const kind = String(searchParams.get?.("kind") ?? searchParams.kind ?? "").trim() || null;
  const since = String(searchParams.get?.("since") ?? searchParams.since ?? "").trim() || null;
  return { limit, kind, since };
}

export function buildNodeLogs(deps = {}, query = {}) {
  const parsed = parseLogsQuery(query);
  const events = listEventLog(deps.db, parsed);

  return {
    schema: "operium.node.logs.v1",
    node_id: deps.nodeId || deps.config?.nodeId || null,
    kind_filter: parsed.kind,
    limit: parsed.limit,
    since: parsed.since,
    count: events.length,
    events,
    generated_at: new Date().toISOString(),
  };
}