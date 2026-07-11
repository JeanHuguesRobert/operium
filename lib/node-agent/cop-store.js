import { randomUUID } from "node:crypto";

const INBOX_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_DELIVERY_ATTEMPTS = 10;

export function inboxExists(db, envelopeId) {
  const row = db.prepare("SELECT id FROM cop_inbox WHERE id = ?").get(envelopeId);
  return Boolean(row);
}

export function recordCopInbox(db, envelope, options = {}) {
  if (inboxExists(db, envelope.id)) {
    return { id: envelope.id, duplicate: true };
  }

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + INBOX_TTL_MS).toISOString();
  const sourceNodeId = String(
    envelope.sender?.node_id
    || options.sourceNodeId
    || "unknown",
  ).trim();

  db.prepare(`
    INSERT INTO cop_inbox (
      id, packet_type, source_node_id, envelope_json, received_at, handled_at, handler_result, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    envelope.id,
    envelope.packet_type,
    sourceNodeId,
    JSON.stringify(envelope),
    now,
    options.handledAt || now,
    options.handlerResult ? JSON.stringify(options.handlerResult) : null,
    expiresAt,
  );

  return { id: envelope.id, duplicate: false };
}

export function enqueueCopOutbox(db, envelope, options = {}) {
  const targetNodeId = String(
    options.targetNodeId
    || envelope.recipient?.node_id
    || "",
  ).trim();
  if (!targetNodeId) {
    return { ok: false, error: "missing_target_node_id" };
  }

  const id = String(envelope.id || `out:${randomUUID()}`).trim();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO cop_outbox (
      id, packet_type, target_node_id, envelope_json, state, attempts, next_attempt_at, created_at
    ) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)
  `).run(
    id,
    envelope.packet_type,
    targetNodeId,
    JSON.stringify({ ...envelope, id }),
    now,
    now,
  );

  return { ok: true, id, target_node_id: targetNodeId };
}

export function listPendingOutbox(db, options = {}) {
  const now = new Date().toISOString();
  const limit = Number(options.limit || 20);
  return db.prepare(`
    SELECT * FROM cop_outbox
    WHERE state = 'pending'
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      AND attempts < ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(now, MAX_DELIVERY_ATTEMPTS, limit);
}

export function markOutboxDelivered(db, id) {
  db.prepare(`
    UPDATE cop_outbox
    SET state = 'delivered', next_attempt_at = NULL
    WHERE id = ?
  `).run(id);
}

export function markOutboxFailed(db, row, error, options = {}) {
  const attempts = Number(row.attempts || 0) + 1;
  const maxAttempts = Number(options.maxAttempts || MAX_DELIVERY_ATTEMPTS);
  const state = attempts >= maxAttempts ? "failed" : "pending";
  const backoffMs = Math.min(60_000 * (2 ** (attempts - 1)), 3_600_000);
  const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();

  db.prepare(`
    UPDATE cop_outbox
    SET state = ?, attempts = ?, next_attempt_at = ?
    WHERE id = ?
  `).run(state, attempts, state === "pending" ? nextAttemptAt : null, row.id);

  return { attempts, state, next_attempt_at: state === "pending" ? nextAttemptAt : null, error };
}

export function findPeerEndpoint(db, nodeId) {
  const row = db.prepare(`
    SELECT endpoint, hostname, attractor_id, fresh
    FROM peer_nodes
    WHERE node_id = ?
    ORDER BY fresh DESC, updated_at DESC
    LIMIT 1
  `).get(nodeId);
  return row || null;
}