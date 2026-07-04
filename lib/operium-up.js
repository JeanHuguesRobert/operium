import os from "node:os";
import { computeDrift, nextActions, openDecisions } from "./drift.js";
import { defaultAggregatorUrl } from "./paths.js";
import { fetchJson, probeLocalServices, probeTailscale } from "./probes.js";
import { loadRegistry } from "./registry.js";
import { mapRemoteStatus, summarizeHealth } from "./runtime-map.js";

export async function buildOperiumUp(options = {}) {
  const probe = options.probe !== false;
  const registryPath = options.registryPath;
  const aggregatorUrl = String(options.aggregatorUrl || defaultAggregatorUrl(options.env)).replace(/\/$/, "");
  const section = String(options.section || "").trim().toLowerCase();

  const catalogue = loadRegistry({ registryPath, env: options.env });
  const mesh = probe
    ? await probeTailscale({ timeoutMs: options.timeoutMs })
    : { ok: false, available: false, peers: [], skipped: true };

  let remoteFetch = { ok: false, status: 0, url: `${aggregatorUrl}/ops/status`, body: null };
  if (probe) {
    remoteFetch = await fetchJson(remoteFetch.url, { timeoutMs: options.timeoutMs });
  }

  const runtime = mapRemoteStatus(remoteFetch.body || {});
  if (!remoteFetch.ok) {
    runtime.ok = false;
    runtime.error = remoteFetch.body?.error || `http_${remoteFetch.status || "failed"}`;
  }

  const local = probe
    ? await probeLocalServices(catalogue, { hostname: options.hostname, timeoutMs: options.timeoutMs })
    : { services: {}, skipped: true };

  const drift = computeDrift({ catalogue, mesh, runtime, local });
  const summary = summarizeHealth({ runtime, mesh, drift, catalogue });
  const actions = nextActions(drift, summary);

  const result = {
    schema: "operium.up.v1",
    ok: summary.critical_path_ok,
    generated_at: new Date().toISOString(),
    role: "observer",
    observer: {
      hostname: options.hostname || os.hostname(),
      registry_path: catalogue.registry_path,
      aggregator_url: aggregatorUrl,
      probe_mode: probe ? "active" : "catalogue_only",
    },
    summary,
    layers: {
      catalogue: {
        ok: catalogue.ok,
        registry_path: catalogue.registry_path,
        version: catalogue.version,
        updated_at: catalogue.updated_at,
        nodes: catalogue.nodes,
        planned_nodes: catalogue.planned_nodes,
      },
      mesh: {
        ok: mesh.ok === true,
        available: mesh.available === true,
        tailnet: mesh.tailnet || null,
        hostname: mesh.hostname || null,
        tailscale_ip: mesh.tailscale_ip || null,
        peers: mesh.peers || [],
        error: mesh.error || null,
      },
      services: {
        remote: runtime.layers?.services || {},
        local,
      },
      blackboard: runtime.layers?.blackboard || {},
      retrieval: runtime.layers?.retrieval || {},
      public_face: {
        ...(runtime.layers?.public_face || {}),
        aggregator_url: aggregatorUrl,
        aggregator_http_status: remoteFetch.status || null,
        aggregator_reachable: remoteFetch.ok,
      },
    },
    drift,
    open_decisions: openDecisions(),
    next_actions: actions,
    sources: [
      { type: "registry", path: catalogue.registry_path, ok: catalogue.ok },
      { type: "http", url: remoteFetch.url, ok: remoteFetch.ok, status: remoteFetch.status || null },
      { type: "tailscale", ok: mesh.ok === true },
    ],
  };

  if (section) {
    return filterSection(result, section);
  }
  return result;
}

function filterSection(result, section) {
  const layer = result.layers?.[section];
  if (!layer) {
    return {
      schema: "operium.up.v1",
      ok: false,
      error: "unknown_section",
      section,
      available_sections: Object.keys(result.layers || {}),
    };
  }
  return {
    schema: "operium.up.v1",
    ok: result.ok,
    generated_at: result.generated_at,
    section,
    summary: result.summary,
    data: layer,
  };
}

export function exitCodeForUp(result) {
  if (!result || result.error === "unknown_section") return 3;
  if (result.observer?.probe_mode === "catalogue_only") return 3;
  if (!result.summary?.critical_path_ok) return 2;
  if ((result.summary?.health_score ?? 0) <= 2) return 1;
  return 0;
}