import { randomUUID } from "node:crypto";
import { fetchJson } from "./probes.js";
import { loadOnaConfig } from "./node-agent/config.js";
import { deliverCopOutbox } from "./node-agent/cop-deliverer.js";
import { enqueueCopOutbox } from "./node-agent/cop-store.js";
import { openNodeMemoryDb } from "./node-agent/db.js";
import { COP_NODE_PACKETS } from "./node-agent/envelope.js";
import { readCachedPeerSnapshot, upsertPeerSnapshot } from "./node-agent/snapshot.js";
import { buildNodeDiagnose, exitCodeForDiagnose } from "./node-diagnose.js";

export const DEFAULT_ONA_URL = "http://127.0.0.1:8794";

export function resolveOnaUrl(options = {}) {
  const raw = String(options.url || options.env?.ONA_URL || process.env.ONA_URL || DEFAULT_ONA_URL).trim();
  return raw.replace(/\/$/, "");
}

export function resolveOnaReadToken(options = {}) {
  const env = options.env || process.env;
  return String(
    options.token
    || env.ONA_READ_TOKEN
    || env.ONA_ADMIN_TOKEN
    || process.env.ONA_READ_TOKEN
    || process.env.ONA_ADMIN_TOKEN
    || "",
  ).trim() || null;
}

function buildOnaUrl(path, options = {}) {
  const base = resolveOnaUrl(options);
  const url = new URL(path, `${base}/`);

  if (options.fresh) url.searchParams.set("fresh", "1");
  if (options.logKind) url.searchParams.set("kind", String(options.logKind));
  if (options.logLimit != null) url.searchParams.set("limit", String(options.logLimit));
  if (options.logSince) url.searchParams.set("since", String(options.logSince));

  return url.toString();
}

export async function fetchOnaEndpoint(path, options = {}) {
  const token = resolveOnaReadToken(options);
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = buildOnaUrl(path, options);
  const result = await fetchJson(url, {
    timeoutMs: Number(options.timeoutMs || 10_000),
    headers,
  });

  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      url,
      error: result.body?.error || "ona_request_failed",
      message: result.body?.message || null,
      body: result.body,
    };
  }

  return {
    ok: true,
    status: result.status,
    url,
    body: result.body,
  };
}

export async function runNodeCliCommand(options = {}) {
  switch (options.subcommand) {
    case "status":
      return fetchOnaEndpoint("/node/status", options);
    case "peers":
      return fetchOnaEndpoint("/node/peers", options);
    case "logs":
      return fetchOnaEndpoint("/node/logs", options);
    case "snapshot":
      return runNodeSnapshotCommand(options);
    case "drift":
      return fetchOnaEndpoint("/node/drift", options);
    case "diagnose":
      return runNodeDiagnoseCommand(options);
    default:
      throw new Error(`unknown_node_subcommand: ${options.subcommand}`);
  }
}

export async function runNodeDiagnoseCommand(options = {}) {
  const body = await buildNodeDiagnose(options);
  return { ok: true, body };
}

export async function runNodeSnapshotCommand(options = {}) {
  const peerNodeId = String(options.peerNodeId || "").trim();
  if (!peerNodeId) {
    return fetchOnaEndpoint("/node/snapshot", options);
  }

  if (options.fresh) {
    return fetchFreshPeerSnapshot({
      peerNodeId,
      env: options.env,
      timeoutMs: Number(options.timeoutMs || 30_000),
    });
  }

  return readPeerSnapshotFromCache({
    peerNodeId,
    env: options.env,
  });
}

export function readPeerSnapshotFromCache(options = {}) {
  const peerNodeId = String(options.peerNodeId || "").trim();
  const env = options.env || process.env;
  const { db } = openNodeMemoryDb({ env });

  try {
    const cached = readCachedPeerSnapshot(db, peerNodeId);
    if (!cached.ok) {
      return {
        ok: false,
        error: cached.error,
        node_id: peerNodeId,
      };
    }

    return {
      ok: true,
      body: {
        ...cached.snapshot,
        cached: true,
        fetched_at: cached.fetched_at,
        expires_at: cached.expires_at,
      },
    };
  } finally {
    db.close();
  }
}

export async function fetchFreshPeerSnapshot(options = {}) {
  const peerNodeId = String(options.peerNodeId || "").trim();
  const env = options.env || process.env;
  const timeoutMs = Number(options.timeoutMs || 30_000);

  let config;
  try {
    config = loadOnaConfig(env);
  } catch (error) {
    return {
      ok: false,
      error: error.code || "config_failed",
      message: error.message || null,
    };
  }

  if (!config.copDelivery) {
    return { ok: false, error: "cop_delivery_disabled" };
  }

  const token = String(config.tokens?.peer || "").trim();
  if (!token) {
    return { ok: false, error: "missing_ona_peer_token" };
  }

  const { db } = openNodeMemoryDb({ env });
  const startedAt = new Date().toISOString();

  try {
    const envelope = {
      id: `out:snapshot:${randomUUID()}`,
      packet_type: COP_NODE_PACKETS.SNAPSHOT,
      sender: { node_id: config.nodeId, hostname: config.hostname },
      recipient: { node_id: peerNodeId },
      payload: {},
    };

    const queued = enqueueCopOutbox(db, envelope, { targetNodeId: peerNodeId });
    if (!queued.ok) {
      return { ok: false, error: queued.error || "enqueue_failed" };
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await deliverCopOutbox(db, {
        token,
        timeoutMs: Math.min(timeoutMs, 25_000),
        fetch: options.fetch,
      });

      const cached = readCachedPeerSnapshot(db, peerNodeId);
      if (cached.ok && cached.fetched_at >= startedAt) {
        return {
          ok: true,
          body: {
            ...cached.snapshot,
            cached: false,
            fetched_at: cached.fetched_at,
            expires_at: cached.expires_at,
          },
        };
      }

      await sleep(250);
    }

    return { ok: false, error: "snapshot_fetch_timeout", node_id: peerNodeId };
  } finally {
    db.close();
  }
}

export function cachePeerSnapshotLocally(snapshot, options = {}) {
  const env = options.env || process.env;
  const { db } = openNodeMemoryDb({ env });
  try {
    const stored = upsertPeerSnapshot(db, snapshot, options);
    return stored.ok
      ? { ok: true, body: snapshot }
      : { ok: false, error: stored.error || "cache_failed" };
  } finally {
    db.close();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function exitCodeForNodeResult(result, subcommand) {
  if (!result?.ok) {
    if (subcommand === "snapshot" && result.error === "no_cached_snapshot") return 1;
    return 2;
  }
  if (subcommand === "drift") {
    const drift = result.body?.drift || [];
    if (drift.some(item => item.severity === "error")) return 2;
    if (drift.some(item => item.severity === "warn")) return 1;
    return 0;
  }
  if (subcommand === "diagnose") {
    return exitCodeForDiagnose(result.body);
  }
  if (subcommand === "status") {
    const health = Number(result.body?.health_score);
    if (!Number.isFinite(health)) return 1;
    if (health <= 2) return 2;
    if (health === 3) return 1;
    return 0;
  }
  return 0;
}