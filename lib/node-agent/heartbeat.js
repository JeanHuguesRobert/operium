import { loadRegistry } from "../registry.js";
import { ONA_VERSION, resolveHostname } from "./config.js";
import { resolvedIdentity } from "./catalogue.js";
import {
  buildOperiumNodeAttractor,
  ONA_CAPABILITY,
  ONA_TRANSPORT_PROFILE,
  resolveOnaAdvertiseEndpoint,
} from "./attractor.js";

export async function runOnaHeartbeat(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetch || globalThis.fetch;
  const blackboardUrl = String(env.COGENTIA_BLACKBOARD_URL || "").trim().replace(/\/$/, "");
  const upsertToken = String(
    env.COGENTIA_BLACKBOARD_UPSERT_TOKEN
    || env.COGENTIA_ADMIN_TOKEN
    || "",
  ).trim();
  const withdraw = parseBoolean(options.withdraw ?? env.ONA_ATTRACTOR_WITHDRAW, false);

  if (!blackboardUrl) {
    return fail("missing_blackboard_url", 2);
  }
  if (!upsertToken) {
    return fail("missing_blackboard_upsert_token", 2);
  }

  const hostname = String(options.hostname || resolveHostname(env)).trim().toLowerCase();
  const catalogue = loadRegistry({
    registryPath: options.registryPath || env.OPERIUM_REGISTRY,
    env,
  });
  const identity = resolvedIdentity(catalogue, {
    env,
    hostname,
    nodeId: env.ONA_ATTRACTOR_NODE_ID || env.ONA_NODE_ID || `resource://${hostname}`,
  });

  let health = { ok: false };
  if (!withdraw) {
    health = await probeOnaHealth(env, options);
  }

  const healthOk = health.ok === true;
  const degraded = !withdraw && !healthOk;
  const endpointRef = await resolveOnaAdvertiseEndpoint({
    env,
    hostname: identity.hostname,
    registryPath: options.registryPath,
    catalogueTailscaleIp: options.catalogueTailscaleIp,
    probeTailscale: options.probeTailscale,
    port: Number(env.ONA_PORT || 8794),
  });

  const attractor = buildOperiumNodeAttractor({
    id: env.ONA_ATTRACTOR_ID || `attractor:${identity.hostname}:operium-node`,
    resourceId: env.ONA_ATTRACTOR_NODE_ID || identity.node_id,
    hostname: identity.hostname,
    endpointRef,
    ttlSeconds: Number(env.ONA_ATTRACTOR_TTL_SECONDS || 300),
    status: withdraw ? "offline" : (healthOk ? "online" : "degraded"),
    healthScore: health.health_score,
    onaVersion: String(env.ONA_VERSION || ONA_VERSION),
    trustPerimeter: env.ONA_ATTRACTOR_TRUST_PERIMETER,
  });

  const payload = withdraw
    ? {
      event: "cop/attractor.withdrawn",
      attractor_id: attractor.id,
      reason: String(env.ONA_ATTRACTOR_WITHDRAW_REASON || "host_shutdown").trim(),
    }
    : {
      event: "cop/attractor.advertised",
      advertised_by: attractor.node.resource_id,
      attractor,
    };

  const response = await fetchImpl(`${blackboardUrl}/ops/blackboard/upsert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${upsertToken}`,
      "X-Cogentia-Node": attractor.node.resource_id,
    },
    body: JSON.stringify(payload),
  });

  let body;
  try {
    body = await response.json();
  } catch {
    body = { ok: false, error: "non_json_response", status: response.status };
  }

  if (!response.ok || body.ok === false) {
    return {
      ok: false,
      exitCode: 1,
      error: "blackboard_upsert_failed",
      status: response.status,
      body,
      blackboard_url: blackboardUrl,
      attractor_id: attractor.id,
      withdraw,
    };
  }

  const result = {
    ok: true,
    exitCode: degraded ? 1 : 0,
    event: payload.event,
    attractor_id: attractor.id,
    endpoint_ref: attractor.transport.endpoint_ref,
    availability_status: attractor.availability.status,
    capability: ONA_CAPABILITY,
    transport_profile: ONA_TRANSPORT_PROFILE,
    health_ok: healthOk,
    health_score: health.health_score ?? null,
    ttl_seconds: attractor.availability.ttl_seconds,
    snapshot_at: body.snapshot_at,
    withdraw,
  };

  return result;
}

async function probeOnaHealth(env, options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const healthUrl = String(
    options.healthUrl
    || env.ONA_HEARTBEAT_URL
    || `http://127.0.0.1:${env.ONA_PORT || 8794}/health`,
  ).trim();
  const timeoutMs = Number(env.ONA_HEARTBEAT_TIMEOUT_MS || 45_000);
  const readToken = String(env.ONA_READ_TOKEN || "").trim();

  const health = await fetchHealth(fetchImpl, healthUrl, { timeoutMs });
  if (!health.ok) return health;

  const statusUrl = healthUrl.replace(/\/health\/?$/, "/node/status");
  if (readToken && options.fetchStatus !== false) {
    const status = await fetchHealth(fetchImpl, statusUrl, {
      timeoutMs,
      token: readToken,
    });
    if (status.ok && status.body?.health_score != null) {
      health.health_score = status.body.health_score;
    }
  }

  return health;
}

async function fetchHealth(fetchImpl, url, options = {}) {
  const headers = { Accept: "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  try {
    const response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(options.timeoutMs || 45_000),
    });
    const body = await response.json();
    return {
      ok: response.ok && body.ok === true,
      url,
      body,
      health_score: body.health_score ?? null,
      error: response.ok && body.ok !== false ? null : body.error || `http_${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      url,
      body: null,
      error: error.message || "fetch_failed",
    };
  }
}

function fail(error, exitCode) {
  return { ok: false, exitCode, error };
}

function parseBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  const clean = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(clean)) return true;
  if (["0", "false", "no", "off"].includes(clean)) return false;
  return fallback;
}