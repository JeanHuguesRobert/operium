const TABLE_RULES = [
  { table: "probe_history", column: "expires_at" },
  { table: "peer_snapshots", column: "expires_at" },
  { table: "cop_inbox", column: "expires_at" },
  { table: "invocation_log", column: "expires_at" },
  { table: "event_log", column: "expires_at" },
];

export function runTtlSweeper(db, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const nowIso = now.toISOString();
  const removed = {};

  for (const rule of TABLE_RULES) {
    const result = db.prepare(
      `DELETE FROM ${rule.table} WHERE ${rule.column} < ?`,
    ).run(nowIso);
    removed[rule.table] = Number(result.changes || 0);
  }

  removed.peer_nodes_expired = sweepExpiredPeerNodes(db, nowIso, now);

  const deliveredCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const failedCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  removed.cop_outbox_delivered = db.prepare(`
    DELETE FROM cop_outbox
    WHERE state = 'delivered' AND created_at < ?
  `).run(deliveredCutoff).changes || 0;
  removed.cop_outbox_failed = db.prepare(`
    DELETE FROM cop_outbox
    WHERE state = 'failed' AND created_at < ?
  `).run(failedCutoff).changes || 0;

  return {
    ok: true,
    swept_at: nowIso,
    removed,
    total_removed: Object.values(removed).reduce((sum, value) => sum + Number(value || 0), 0),
  };
}

function sweepExpiredPeerNodes(db, nowIso, now = new Date()) {
  const rows = db.prepare("SELECT attractor_id, last_seen, ttl_seconds, fresh FROM peer_nodes").all();
  let removed = 0;
  for (const row of rows) {
    const lastSeen = Date.parse(String(row.last_seen || ""));
    const ttlSeconds = Number(row.ttl_seconds || 0);
    if (!Number.isFinite(lastSeen) || ttlSeconds <= 0) continue;
    const expiresAt = new Date(lastSeen + ttlSeconds * 1000).toISOString();
    if (expiresAt < nowIso) {
      db.prepare("DELETE FROM peer_nodes WHERE attractor_id = ?").run(row.attractor_id);
      removed += 1;
      continue;
    }
    if (row.fresh === 1 && !isAttractorFreshFromRow(row, now)) {
      db.prepare("UPDATE peer_nodes SET fresh = 0, updated_at = ? WHERE attractor_id = ?")
        .run(nowIso, row.attractor_id);
    }
  }
  return removed;
}

function isAttractorFreshFromRow(row, now = new Date()) {
  const lastSeen = Date.parse(String(row.last_seen || ""));
  const ttlSeconds = Number(row.ttl_seconds || 0);
  if (!Number.isFinite(lastSeen) || ttlSeconds <= 0) return false;
  const ageMs = now.getTime() - lastSeen;
  return ageMs >= 0 && ageMs <= ttlSeconds * 1000;
}