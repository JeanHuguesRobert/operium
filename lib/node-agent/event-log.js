export function listEventLog(db, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 20), 1), 200);
  const kind = String(options.kind || "").trim();
  const since = String(options.since || "").trim();

  let sql = "SELECT id, kind, detail_json, logged_at FROM event_log";
  const clauses = [];
  const params = [];

  if (kind) {
    clauses.push("kind = ?");
    params.push(kind);
  }
  if (since) {
    clauses.push("logged_at >= ?");
    params.push(since);
  }
  if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
  sql += " ORDER BY logged_at DESC LIMIT ?";
  params.push(limit);

  return db.prepare(sql).all(...params).map(row => ({
    id: row.id,
    kind: row.kind,
    detail: safeJson(row.detail_json),
    logged_at: row.logged_at,
  }));
}

function safeJson(value) {
  try {
    return JSON.parse(String(value || "null"));
  } catch {
    return null;
  }
}