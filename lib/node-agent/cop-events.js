export const COP_CALENDAR_KINDS = {
  WAKE: "cop/node.wake.v1",
  EVIDENCE: "cop/node.evidence.v1",
  CLOSE: "cop/node.close.v1",
  ESCALATE: "cop/node.escalate.v1",
  RESOLVE: "cop/node.resolve.v1",
};

export function appendCopEvent(db, envelope, options = {}) {
  const event = normalizeCopCalendarEvent(envelope, options);
  db.prepare(`
    INSERT OR IGNORE INTO cop_events (
      id, kind, obligation_id, envelope_json, created_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.kind,
    event.obligation_id,
    JSON.stringify(event.envelope),
    event.created_at,
  );
  return event;
}

export function listCopEvents(db, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 200), 1), 2000);
  const kind = String(options.kind || "").trim();
  const obligationId = String(options.obligation_id || "").trim();
  const since = String(options.since || "").trim();
  const order = String(options.order || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";

  const clauses = [];
  const params = [];
  if (kind) {
    clauses.push("kind = ?");
    params.push(kind);
  }
  if (obligationId) {
    clauses.push("obligation_id = ?");
    params.push(obligationId);
  }
  if (since) {
    clauses.push("created_at >= ?");
    params.push(since);
  }

  let sql = "SELECT seq, id, kind, obligation_id, envelope_json, created_at FROM cop_events";
  if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
  sql += ` ORDER BY seq ${order} LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params).map(row => ({
    seq: row.seq,
    id: row.id,
    kind: row.kind,
    obligation_id: row.obligation_id,
    created_at: row.created_at,
    envelope: parseJson(row.envelope_json),
  }));
}

export function countCopEvents(db) {
  return Number(db.prepare("SELECT COUNT(*) AS n FROM cop_events").get()?.n || 0);
}

export function getCopEvent(db, id) {
  const key = String(id || "").trim();
  if (!key) return null;
  const row = db.prepare(`
    SELECT seq, id, kind, obligation_id, envelope_json, created_at
    FROM cop_events
    WHERE id = ?
  `).get(key);
  if (!row) return null;
  return {
    seq: row.seq,
    id: row.id,
    kind: row.kind,
    obligation_id: row.obligation_id,
    created_at: row.created_at,
    envelope: parseJson(row.envelope_json),
  };
}

export function normalizeCopCalendarEvent(envelope = {}, options = {}) {
  const payload = envelope.payload && typeof envelope.payload === "object"
    ? envelope.payload
    : {};
  const kind = String(
    envelope.packet_type || envelope.kind || options.kind || "",
  ).trim();
  const createdAt = envelope.created_at || options.now || new Date().toISOString();
  const obligationId = String(
    options.obligation_id
    || payload.obligation_id
    || "",
  ).trim() || null;
  const id = String(envelope.id || options.id || "").trim()
    || `cop:event:${kind}:${obligationId || "none"}:${createdAt}`;

  return {
    id,
    kind,
    obligation_id: obligationId,
    created_at: createdAt,
    envelope: {
      id,
      packet_type: kind,
      artifact_type: envelope.artifact_type || "cop/event",
      sender: envelope.sender || {},
      recipient: envelope.recipient || {},
      trace: envelope.trace || {},
      created_at: createdAt,
      payload,
    },
  };
}

function parseJson(raw) {
  try {
    return JSON.parse(String(raw || "null"));
  } catch {
    return null;
  }
}
