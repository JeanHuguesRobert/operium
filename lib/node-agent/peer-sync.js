import { fetchJson } from "../probes.js";
import { ONA_CAPABILITY } from "./attractor.js";

const HTTP_ENDPOINT_RE = /^https?:\/\//i;

export function isAttractorFresh(attractor = {}, now = new Date()) {
  const lastSeen = Date.parse(String(attractor.availability?.last_seen || ""));
  const ttlSeconds = Number(attractor.availability?.ttl_seconds);
  if (!Number.isFinite(lastSeen) || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return false;
  const ageMs = now.getTime() - lastSeen;
  return ageMs >= 0 && ageMs <= ttlSeconds * 1000;
}

export function hasOnaCapability(attractor = {}) {
  const capabilities = Array.isArray(attractor.matches?.capabilities)
    ? attractor.matches.capabilities
    : [];
  return capabilities.some(
    value => String(value || "").trim().toLowerCase() === ONA_CAPABILITY.toLowerCase(),
  );
}

export function isAcceptablePeerEndpoint(endpointRef, expectedPort = 8794) {
  const value = String(endpointRef || "").trim();
  if (!HTTP_ENDPOINT_RE.test(value)) return false;
  if (value.startsWith("secret://")) return false;
  try {
    const url = new URL(value);
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    return String(port) === String(expectedPort);
  } catch {
    return false;
  }
}

export function normalizePeerAttractor(attractor = {}, now = new Date()) {
  const endpoint = String(attractor.transport?.endpoint_ref || "").trim().replace(/\/$/, "");
  if (!isAcceptablePeerEndpoint(endpoint)) {
    return { ok: false, error: "unacceptable_endpoint", attractor_id: attractor.id || null };
  }

  const lastSeen = String(attractor.availability?.last_seen || now.toISOString());
  const ttlSeconds = Number(attractor.availability?.ttl_seconds || 300);
  const expiresAt = new Date(Date.parse(lastSeen) + ttlSeconds * 1000).toISOString();
  const capabilities = Array.isArray(attractor.matches?.capabilities)
    ? attractor.matches.capabilities.map(value => String(value || "").trim()).filter(Boolean)
    : [];

  return {
    ok: true,
    peer: {
      attractor_id: String(attractor.id || "").trim(),
      node_id: String(attractor.node?.resource_id || "").trim() || null,
      hostname: String(attractor.node?.hostname || "").trim()
        || inferHostnameFromAttractorId(attractor.id),
      endpoint,
      capabilities: JSON.stringify(capabilities),
      status: String(attractor.availability?.status || "online").trim() || "online",
      last_seen: lastSeen,
      ttl_seconds: ttlSeconds,
      fresh: isAttractorFresh(attractor, now) ? 1 : 0,
      expires_at: expiresAt,
      updated_at: now.toISOString(),
      metadata: {
        ona_version: attractor.metadata?.ona_version || null,
        health_score: attractor.metadata?.health_score ?? null,
        transport_profile: attractor.transport?.profile || null,
      },
    },
  };
}

export async function fetchOnaBlackboardSnapshot(options = {}) {
  const env = options.env || process.env;
  const blackboardUrl = String(options.blackboardUrl || env.COGENTIA_BLACKBOARD_URL || "").trim().replace(/\/$/, "");
  if (!blackboardUrl) {
    return { ok: false, error: "missing_blackboard_url" };
  }

  const fresh = options.fresh !== false;
  const url = `${blackboardUrl}/ops/blackboard?capability=${encodeURIComponent(ONA_CAPABILITY)}&fresh=${fresh ? "1" : "0"}`;
  const result = await fetchJson(url, { timeoutMs: options.timeoutMs || 25_000 });
  if (!result.ok) {
    return {
      ok: false,
      error: result.body?.error || `http_${result.status || "failed"}`,
      url,
      status: result.status,
      body: result.body,
    };
  }

  return {
    ok: true,
    url,
    snapshot_at: result.body?.snapshot_at || null,
    count: result.body?.count ?? (Array.isArray(result.body?.attractors) ? result.body.attractors.length : 0),
    attractors: Array.isArray(result.body?.attractors) ? result.body.attractors : [],
  };
}

export function selectPeerAttractors(attractors, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const selfAttractorId = String(
    options.selfAttractorId
    || options.env?.ONA_ATTRACTOR_ID
    || "",
  ).trim().toLowerCase();
  const freshOnly = options.fresh !== false;

  return (Array.isArray(attractors) ? attractors : [])
    .filter(item => hasOnaCapability(item))
    .filter(item => String(item.id || "").trim().toLowerCase() !== selfAttractorId)
    .filter(item => !freshOnly || isAttractorFresh(item, now))
    .map(item => normalizePeerAttractor(item, now))
    .filter(item => item.ok)
    .map(item => item.peer);
}

export function upsertPeerNodes(db, peers = []) {
  const stmt = db.prepare(`
    INSERT INTO peer_nodes (
      attractor_id, node_id, hostname, endpoint, capabilities, status,
      last_seen, ttl_seconds, fresh, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(attractor_id) DO UPDATE SET
      node_id = excluded.node_id,
      hostname = excluded.hostname,
      endpoint = excluded.endpoint,
      capabilities = excluded.capabilities,
      status = excluded.status,
      last_seen = excluded.last_seen,
      ttl_seconds = excluded.ttl_seconds,
      fresh = excluded.fresh,
      updated_at = excluded.updated_at
  `);

  const seen = new Set();
  for (const peer of peers) {
    seen.add(peer.attractor_id);
    stmt.run(
      peer.attractor_id,
      peer.node_id,
      peer.hostname,
      peer.endpoint,
      peer.capabilities,
      peer.status,
      peer.last_seen,
      peer.ttl_seconds,
      peer.fresh,
      peer.updated_at,
    );
  }

  const existing = db.prepare("SELECT attractor_id FROM peer_nodes").all();
  for (const row of existing) {
    if (!seen.has(row.attractor_id)) {
      db.prepare("DELETE FROM peer_nodes WHERE attractor_id = ?").run(row.attractor_id);
    }
  }

  return {
    upserted: peers.length,
    removed: existing.filter(row => !seen.has(row.attractor_id)).length,
  };
}

export async function syncPeersFromBlackboard(db, options = {}) {
  const snapshot = await fetchOnaBlackboardSnapshot(options);
  if (!snapshot.ok) return snapshot;

  const peers = selectPeerAttractors(snapshot.attractors, options);
  const write = upsertPeerNodes(db, peers);

  const now = new Date().toISOString();
  if (options.nodeId) {
    db.prepare(`
      UPDATE local_state
      SET last_blackboard_sync_at = ?, updated_at = ?
      WHERE node_id = ?
    `).run(now, now, options.nodeId);
  }

  return {
    ok: true,
    snapshot_at: snapshot.snapshot_at,
    blackboard_count: snapshot.count,
    peer_count: peers.length,
    fresh_peer_count: peers.filter(peer => peer.fresh === 1).length,
    ...write,
    synced_at: now,
  };
}

export function listPeerNodes(db, options = {}) {
  const freshOnly = options.fresh === true;
  const rows = freshOnly
    ? db.prepare("SELECT * FROM peer_nodes WHERE fresh = 1 ORDER BY hostname ASC").all()
    : db.prepare("SELECT * FROM peer_nodes ORDER BY hostname ASC").all();

  return rows.map(row => ({
    attractor_id: row.attractor_id,
    node_id: row.node_id,
    hostname: row.hostname,
    endpoint: row.endpoint,
    capabilities: safeJsonArray(row.capabilities),
    status: row.status,
    last_seen: row.last_seen,
    ttl_seconds: row.ttl_seconds,
    fresh: row.fresh === 1,
    updated_at: row.updated_at,
  }));
}

export function buildNodePeers(deps = {}) {
  const config = deps.config;
  const db = deps.db;
  const freshOnly = deps.fresh === true;
  const peers = listPeerNodes(db, { fresh: freshOnly });
  const local = db.prepare("SELECT last_blackboard_sync_at, node_id FROM local_state LIMIT 1").get();

  return {
    schema: "operium.node.peers.v1",
    node_id: deps.nodeId || config?.nodeId || local?.node_id || null,
    fresh_only: freshOnly,
    count: peers.length,
    peers,
    last_blackboard_sync_at: local?.last_blackboard_sync_at || null,
    generated_at: new Date().toISOString(),
  };
}

function inferHostnameFromAttractorId(attractorId) {
  const match = String(attractorId || "").match(/^attractor:([^:]+):operium-node$/i);
  return match?.[1] || null;
}

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}