const viteEnv = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
const OPS_BASE = String(viteEnv.VITE_COGENTIA_OPS_BASE_URL || "").replace(/\/$/, "");
const OPS_TOKEN = String(viteEnv.VITE_COGENTIA_OPS_TOKEN || "").trim();

export function encodeNodeId(nodeId) {
  return encodeURIComponent(String(nodeId || "").trim());
}

export function buildNodeOpsPath(nodeId, suffix) {
  const segment = encodeNodeId(nodeId);
  return `/ops/node/${segment}/${suffix}`;
}

export function getOpsConfig() {
  return {
    baseUrl: OPS_BASE,
    hasToken: Boolean(OPS_TOKEN),
  };
}

export async function fetchOpsJson(path, options = {}) {
  const url = `${OPS_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = { Accept: "application/json" };
  if (options.auth && OPS_TOKEN) {
    headers.Authorization = `Bearer ${OPS_TOKEN}`;
  }

  const response = await fetch(url, { headers, signal: options.signal });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    body = { ok: false, error: "invalid_json", raw: text.slice(0, 200) };
  }

  return {
    ok: response.ok && body.ok !== false,
    status: response.status,
    url,
    body,
  };
}

export async function fetchFleetStatus(signal) {
  return fetchOpsJson("/ops/status", { signal });
}

export async function fetchFleetBlackboard(signal) {
  return fetchOpsJson("/ops/blackboard?capability=operium.node.v1&fresh=0", { signal });
}

export async function fetchNodeStatus(nodeId, signal) {
  return fetchOpsJson(buildNodeOpsPath(nodeId, "status"), { auth: true, signal });
}

export async function fetchNodeDrift(nodeId, signal) {
  return fetchOpsJson(buildNodeOpsPath(nodeId, "drift"), { auth: true, signal });
}

export function listOnaAttractors(blackboard = {}) {
  const attractors = Array.isArray(blackboard.attractors) ? blackboard.attractors : [];
  return attractors
    .filter(item => hasOnaCapability(item))
    .map(normalizeOnaAttractor)
    .sort((a, b) => a.hostname.localeCompare(b.hostname));
}

function hasOnaCapability(attractor = {}) {
  const capabilities = Array.isArray(attractor.matches?.capabilities)
    ? attractor.matches.capabilities
    : [];
  return capabilities.some(
    value => String(value || "").trim().toLowerCase() === "operium.node.v1",
  );
}

function normalizeOnaAttractor(attractor = {}) {
  const lastSeen = attractor.availability?.last_seen || null;
  const ttlSeconds = Number(attractor.availability?.ttl_seconds || 0);
  const fresh = isAttractorFresh(lastSeen, ttlSeconds);

  return {
    id: attractor.id || null,
    node_id: attractor.node?.resource_id || null,
    hostname: attractor.node?.hostname || inferHostname(attractor.id),
    endpoint: attractor.transport?.endpoint_ref || null,
    status: attractor.availability?.status || "unknown",
    health_score: attractor.metadata?.health_score ?? null,
    last_seen: lastSeen,
    ttl_seconds: ttlSeconds,
    fresh,
  };
}

function isAttractorFresh(lastSeen, ttlSeconds) {
  const seenMs = Date.parse(String(lastSeen || ""));
  if (!Number.isFinite(seenMs) || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return false;
  }
  const ageMs = Date.now() - seenMs;
  return ageMs >= 0 && ageMs <= ttlSeconds * 1000;
}

function inferHostname(attractorId) {
  const match = String(attractorId || "").match(/^attractor:([^:]+):operium-node$/i);
  return match?.[1] || "unknown";
}

export function healthTone(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return "muted";
  if (value >= 4) return "ok";
  if (value >= 3) return "warn";
  return "bad";
}