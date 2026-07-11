import { randomUUID } from "node:crypto";
import { readLocalState, readLocalStateByNodeId } from "./db.js";
import { listEventLog } from "./event-log.js";
import { readLatestProbes } from "./local-state.js";
import { listPeerNodes } from "./peer-sync.js";
import { buildNodeStatus } from "./status.js";

const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SNAPSHOTS_PER_PEER = 50;

export function buildNodeSnapshot(deps = {}) {
  const config = deps.config;
  const db = deps.db;
  const nodeId = deps.nodeId || config?.nodeId;
  const startedAt = deps.startedAt || new Date().toISOString();

  const status = buildNodeStatus({ config, db, startedAt, nodeId });
  const local = readLocalStateByNodeId(db, nodeId) || readLocalState(db);
  const peers = listPeerNodes(db, { fresh: false });
  const probeHistory = readLatestProbes(db, deps.probeLimit || 50);
  const recentEvents = listEventLog(db, { limit: deps.eventLimit || 20 });

  return {
    schema: "operium.node.snapshot.v1",
    node_id: nodeId,
    hostname: local?.hostname || config?.hostname || null,
    status,
    local_state: serializeLocalState(local),
    peers,
    probe_history: probeHistory.map(row => ({
      probe_kind: row.probe_kind,
      target: row.target,
      ok: row.ok === 1,
      latency_ms: row.latency_ms,
      probed_at: row.probed_at,
    })),
    recent_events: recentEvents,
    sqlite_stats: status.sqlite_stats,
    generated_at: new Date().toISOString(),
  };
}

export function upsertPeerSnapshot(db, snapshot, options = {}) {
  const nodeId = String(snapshot?.node_id || options.nodeId || "").trim();
  if (!nodeId) {
    return { ok: false, error: "missing_node_id" };
  }

  const now = new Date().toISOString();
  const id = String(options.id || `snapshot:${nodeId}:${now}`).trim();
  const expiresAt = new Date(Date.now() + SNAPSHOT_TTL_MS).toISOString();

  db.prepare(`
    INSERT INTO peer_snapshots (id, node_id, snapshot_json, fetched_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    id,
    nodeId,
    JSON.stringify(snapshot),
    now,
    expiresAt,
  );

  prunePeerSnapshots(db, nodeId);
  return { ok: true, id, node_id: nodeId, fetched_at: now, expires_at: expiresAt };
}

export function readCachedPeerSnapshot(db, nodeId) {
  const normalized = String(nodeId || "").trim();
  if (!normalized) {
    return { ok: false, error: "missing_node_id" };
  }

  const row = db.prepare(`
    SELECT id, snapshot_json, fetched_at, expires_at
    FROM peer_snapshots
    WHERE node_id = ?
    ORDER BY fetched_at DESC
    LIMIT 1
  `).get(normalized);

  if (!row) {
    return { ok: false, error: "no_cached_snapshot", node_id: normalized };
  }

  let snapshot;
  try {
    snapshot = JSON.parse(String(row.snapshot_json || "{}"));
  } catch {
    return { ok: false, error: "invalid_cached_snapshot", node_id: normalized };
  }

  return {
    ok: true,
    cached: true,
    node_id: normalized,
    fetched_at: row.fetched_at,
    expires_at: row.expires_at,
    snapshot,
  };
}

export function upsertPeerSnapshotFromCopResponse(db, responseBody, targetNodeId) {
  const payload = responseBody?.response_envelope?.payload;
  if (!payload || payload.schema !== "operium.node.snapshot.v1") {
    return { ok: false, error: "missing_snapshot_payload" };
  }

  const nodeId = String(payload.node_id || targetNodeId || "").trim();
  return upsertPeerSnapshot(db, { ...payload, node_id: nodeId }, {
    id: `snapshot:${nodeId}:${randomUUID()}`,
  });
}

function prunePeerSnapshots(db, nodeId) {
  const count = Number(db.prepare(`
    SELECT COUNT(*) AS count FROM peer_snapshots WHERE node_id = ?
  `).get(nodeId)?.count || 0);

  if (count <= MAX_SNAPSHOTS_PER_PEER) return;

  const excess = count - MAX_SNAPSHOTS_PER_PEER;
  db.prepare(`
    DELETE FROM peer_snapshots
    WHERE id IN (
      SELECT id FROM peer_snapshots
      WHERE node_id = ?
      ORDER BY fetched_at ASC
      LIMIT ?
    )
  `).run(nodeId, excess);
}

function serializeLocalState(local) {
  if (!local) return null;
  return {
    node_id: local.node_id,
    hostname: local.hostname,
    schema_version: local.schema_version,
    started_at: local.started_at,
    last_probe_at: local.last_probe_at,
    last_blackboard_sync_at: local.last_blackboard_sync_at,
    health_score: local.health_score,
    updated_at: local.updated_at,
  };
}