import {
  enqueueCopOutbox,
  findPeerEndpoint,
  listPendingOutbox,
  markOutboxDelivered,
  markOutboxFailed,
} from "./cop-store.js";
import { COP_NODE_PACKETS } from "./envelope.js";
import { upsertPeerSnapshotFromCopResponse } from "./snapshot.js";

export async function deliverCopOutbox(db, options = {}) {
  if (options.enabled === false) {
    return { ok: true, skipped: true, delivered: 0, failed: 0 };
  }

  const token = String(options.token || "").trim();
  if (!token) {
    return { ok: false, error: "missing_peer_token" };
  }

  const fetchImpl = options.fetch || globalThis.fetch;
  const rows = listPendingOutbox(db, options);
  const results = [];

  for (const row of rows) {
    const peer = findPeerEndpoint(db, row.target_node_id);
    if (!peer?.endpoint) {
      const fail = markOutboxFailed(db, row, "peer_endpoint_not_found", options);
      results.push({ id: row.id, ok: false, error: "peer_endpoint_not_found", ...fail });
      continue;
    }

    let envelope;
    try {
      envelope = JSON.parse(row.envelope_json);
    } catch {
      markOutboxFailed(db, row, "invalid_envelope_json", options);
      results.push({ id: row.id, ok: false, error: "invalid_envelope_json" });
      continue;
    }

    const url = `${String(peer.endpoint).replace(/\/$/, "")}/node/cop`;
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(envelope),
        signal: AbortSignal.timeout(options.timeoutMs || 25_000),
      });
      const body = await response.json();
      if (response.ok && body.ok !== false) {
        markOutboxDelivered(db, row.id);
        let snapshotStored = null;
        if (envelope.packet_type === COP_NODE_PACKETS.SNAPSHOT) {
          snapshotStored = upsertPeerSnapshotFromCopResponse(db, body, row.target_node_id);
        }
        results.push({
          id: row.id,
          ok: true,
          status: response.status,
          url,
          snapshot_stored: snapshotStored?.ok === true,
        });
      } else {
        const fail = markOutboxFailed(db, row, body.error || `http_${response.status}`, options);
        results.push({
          id: row.id,
          ok: false,
          status: response.status,
          error: body.error || body.error,
          ...fail,
        });
      }
    } catch (error) {
      const fail = markOutboxFailed(db, row, error.message || "delivery_failed", options);
      results.push({ id: row.id, ok: false, error: error.message, ...fail });
    }
  }

  return {
    ok: true,
    delivered: results.filter(item => item.ok).length,
    failed: results.filter(item => !item.ok).length,
    results,
  };
}

export function queueCopDelivery(db, envelope, options = {}) {
  return enqueueCopOutbox(db, envelope, {
    targetNodeId: options.targetNodeId || envelope.recipient?.node_id,
  });
}