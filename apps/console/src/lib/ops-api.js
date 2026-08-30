const viteEnv = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
const OPS_BASE = String(viteEnv.VITE_COGENTIA_OPS_BASE_URL || "").replace(/\/$/, "");
const VIEWS_BASE = String(viteEnv.VITE_COGENTIA_VIEWS_BASE_URL || "").replace(/\/$/, "");
const TOKEN_STORAGE_KEY = "operium.ops.token";
export const FIX_BUGS_FIRST_DASHBOARD_PATH = "/views/fix-bugs-first-dashboard.json?raw";

function runtimeOpsToken() {
  try {
    return String(globalThis.sessionStorage?.getItem(TOKEN_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function setOpsToken(value) {
  const token = String(value || "").trim();
  try {
    if (token) globalThis.sessionStorage?.setItem(TOKEN_STORAGE_KEY, token);
    else globalThis.sessionStorage?.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Session storage is an optional browser convenience, not an authority.
  }
  return Boolean(token);
}

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
    hasToken: Boolean(runtimeOpsToken()),
  };
}

export async function fetchOpsJson(path, options = {}) {
  const url = `${OPS_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = { Accept: "application/json" };
  const token = runtimeOpsToken();
  if (options.auth && token) {
    headers.Authorization = `Bearer ${token}`;
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

export async function fetchFixBugsFirstDashboard(signal) {
  const url = `${VIEWS_BASE}${FIX_BUGS_FIRST_DASHBOARD_PATH}`;
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    body = { error: "invalid_json" };
  }
  return { ok: response.ok && body?.schema === "cogentia.fix-bugs-first-dashboard.v1", status: response.status, url, body };
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

export async function fetchNodeCalendar(nodeId, signal) {
  return fetchOpsJson(buildNodeOpsPath(nodeId, "calendar"), { auth: true, signal });
}

export async function fetchNodeSomaObject(nodeId, signal) {
  return fetchOpsJson(buildNodeOpsPath(nodeId, "soma/object"), { auth: true, signal });
}

export async function fetchNodeSomaVocabulary(nodeId, signal) {
  return fetchOpsJson(buildNodeOpsPath(nodeId, "soma/vocabulary"), { auth: true, signal });
}

export async function fetchNodeSomaActions(nodeId, signal) {
  return fetchOpsJson(buildNodeOpsPath(nodeId, "soma/actions"), { auth: true, signal });
}

export async function executeNodeSomaAction(nodeId, actionName, payload = {}, signal) {
  const path = buildNodeOpsPath(nodeId, `soma/actions/${actionName}`);
  const url = `${OPS_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const token = runtimeOpsToken();
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });
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
