import { randomUUID } from "node:crypto";

const PROBE_HISTORY_MAX_ROWS = 500;
const PROBE_HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function computeHealthScore(probes, catalogue = { ok: true }) {
  if (!catalogue.ok) return 2;

  const applicable = probes.filter(probe => !probe.skipped);
  if (applicable.length === 0) return 3;

  const failed = applicable.filter(probe => probe.ok !== true).length;
  if (failed === 0) {
    return applicable.length >= 3 ? 4 : 3;
  }
  if (failed === applicable.length) return 1;
  return Math.max(2, 3 - failed);
}

export function upsertLocalIdentity(db, identity) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO local_state (
      node_id, hostname, schema_version, started_at, health_score, updated_at
    ) VALUES (?, ?, 1, ?, 0, ?)
    ON CONFLICT(node_id) DO UPDATE SET
      hostname = excluded.hostname,
      updated_at = excluded.updated_at
  `).run(identity.node_id, identity.hostname, now, now);
}

export function syncLocalIdentity(db, identity) {
  const existing = db.prepare("SELECT node_id FROM local_state LIMIT 1").get();
  if (existing?.node_id && existing.node_id !== identity.node_id) {
    db.prepare("DELETE FROM local_state WHERE node_id = ?").run(existing.node_id);
  }
  upsertLocalIdentity(db, identity);
}

export function applyProbeCycle(db, cycle, options = {}) {
  if (options.nodeId && options.hostname) {
    upsertLocalIdentity(db, {
      node_id: options.nodeId,
      hostname: options.hostname,
    });
  }

  const now = new Date().toISOString();
  const healthScore = computeHealthScore(cycle.probes, options.catalogue);
  const statusJson = JSON.stringify({
    probes: cycle.probes,
    probed_at: cycle.probed_at,
    catalogue_node: cycle.catalogue_node,
    resource_id: cycle.resource_id,
  });

  for (const probe of cycle.probes) {
    if (probe.skipped) continue;
    insertProbeHistory(db, probe, now);
  }

  pruneProbeHistory(db);

  const nodeId = options.nodeId;
  db.prepare(`
    UPDATE local_state
    SET last_probe_at = ?,
        health_score = ?,
        status_json = ?,
        updated_at = ?
    WHERE node_id = ?
  `).run(now, healthScore, statusJson, now, nodeId);

  return {
    health_score: healthScore,
    probe_count: cycle.probes.filter(probe => !probe.skipped).length,
    failed_count: cycle.probes.filter(probe => !probe.skipped && probe.ok !== true).length,
    probed_at: now,
  };
}

function insertProbeHistory(db, probe, now) {
  const probedAt = now;
  const expiresAt = new Date(Date.now() + PROBE_HISTORY_TTL_MS).toISOString();
  const resultJson = JSON.stringify({
    ok: probe.ok,
    skipped: false,
    latency_ms: probe.latency_ms,
    result: probe.result,
  }).slice(0, 4000);

  db.prepare(`
    INSERT INTO probe_history (
      id, probe_kind, target, ok, latency_ms, result_json, probed_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `probe:${randomUUID()}`,
    probe.probe_kind,
    probe.target,
    probe.ok === true ? 1 : 0,
    probe.latency_ms ?? null,
    resultJson,
    probedAt,
    expiresAt,
  );
}

function pruneProbeHistory(db) {
  const count = Number(db.prepare("SELECT COUNT(*) AS count FROM probe_history").get()?.count || 0);
  if (count <= PROBE_HISTORY_MAX_ROWS) return;

  const excess = count - PROBE_HISTORY_MAX_ROWS;
  db.prepare(`
    DELETE FROM probe_history
    WHERE id IN (
      SELECT id FROM probe_history
      ORDER BY probed_at ASC
      LIMIT ?
    )
  `).run(excess);
}

export function readLatestProbes(db, limit = 8) {
  return db.prepare(`
    SELECT probe_kind, target, ok, latency_ms, probed_at
    FROM probe_history
    ORDER BY probed_at DESC
    LIMIT ?
  `).all(limit);
}