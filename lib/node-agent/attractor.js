import { loadRegistry } from "../registry.js";
import { probeTailscale } from "../probes.js";
import { resolveCatalogueNode } from "./catalogue.js";
import { resolveHostname } from "./config.js";

export const ARTIFACT_TYPE = "cop/packet-attractor";
export const ONA_CAPABILITY = "operium.node.v1";
export const ONA_TRANSPORT_PROFILE = "operium.node.v1";

export function buildOperiumNodeAttractor(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const hostname = String(options.hostname || "local").trim();
  const resourceId = String(options.resourceId || `resource://${hostname}`).trim();
  const id = String(options.id || `attractor:${hostname}:operium-node`).trim();
  const endpointRef = String(options.endpointRef || `http://127.0.0.1:${options.port || 8794}`).trim();
  const ttlSeconds = Number(options.ttlSeconds || 300);
  const status = String(options.status || "online").trim() || "online";
  const healthScore = options.healthScore;

  return {
    artifactType: ARTIFACT_TYPE,
    id,
    node: {
      resource_id: resourceId,
      hostname,
      trust_perimeter: String(options.trustPerimeter || "owner-operated").trim() || "owner-operated",
    },
    matches: {
      packetKind: ["mandate", "cognitive-packet"],
      capabilities: [ONA_CAPABILITY],
      verbs: ["node.status@v1", "node.cop@v1"],
    },
    legitimacy: {
      mandate_surfaces: ["owner-cli", "orchestrator", "operium-console"],
      forbidden: ["public-internet"],
    },
    pressure: {
      accepted: ["best-effort", "ttl", "bounded"],
      default: "ttl",
    },
    regime: {
      current: status === "degraded" ? "degraded" : "normal",
      accepts: ["normal", "degraded"],
    },
    availability: {
      status,
      last_seen: now.toISOString(),
      ttl_seconds: ttlSeconds,
    },
    transport: {
      profile: ONA_TRANSPORT_PROFILE,
      endpoint_ref: endpointRef,
    },
    metadata: {
      ona_version: String(options.onaVersion || "0.1.0"),
      ...(healthScore != null && Number.isFinite(Number(healthScore))
        ? { health_score: Number(healthScore) }
        : {}),
    },
    trace: {
      advertised_event_required: true,
      matched_event_required: false,
    },
  };
}

export async function resolveOnaAdvertiseEndpoint(options = {}) {
  const env = options.env || process.env;
  const port = Number(options.port || env.ONA_PORT || 8794);

  const explicit = String(
    options.endpointRef
    || env.ONA_ATTRACTOR_ENDPOINT
    || env.ONA_ATTRACTOR_ENDPOINT_REF
    || "",
  ).trim();
  if (explicit.startsWith("http://") || explicit.startsWith("https://")) {
    return explicit.replace(/\/$/, "");
  }

  const catalogueIp = resolveCatalogueTailscaleIp(options);
  if (catalogueIp) return `http://${catalogueIp}:${port}`;

  const envIp = String(env.ONA_ATTRACTOR_TAILSCALE_IP || "").trim();
  if (envIp) return `http://${envIp}:${port}`;

  if (options.probeTailscale !== false) {
    const mesh = await probeTailscale({ timeoutMs: options.timeoutMs || 5000 });
    if (mesh.ok && mesh.tailscale_ip) {
      return `http://${mesh.tailscale_ip}:${port}`;
    }
  }

  const hostname = String(options.hostname || resolveHostname(env)).trim();
  return `http://${hostname}:${port}`;
}

function resolveCatalogueTailscaleIp(options = {}) {
  if (options.catalogueTailscaleIp) {
    return String(options.catalogueTailscaleIp).trim();
  }
  const env = options.env || process.env;
  const catalogue = options.catalogue || loadRegistry({
    registryPath: options.registryPath || env.OPERIUM_REGISTRY,
    env,
  });
  const node = resolveCatalogueNode(catalogue, {
    env,
    hostname: options.hostname || resolveHostname(env),
    tailscaleIp: env.ONA_ATTRACTOR_TAILSCALE_IP,
  });
  const ip = String(node?.transport?.tailscale_ip || "").trim();
  return ip || null;
}