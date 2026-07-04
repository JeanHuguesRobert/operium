export function mapRemoteStatus(body = {}) {
  if (body.schema === "operium.up.v1" && body.layers) {
    return {
      ok: body.ok !== false,
      schema: "operium.up.v1",
      role: body.role || "runtime-aggregator",
      generated_at: body.generated_at || null,
      layers: body.layers,
      legacy: body.legacy || null,
      error: body.ok === false ? body.error : null,
    };
  }

  const guide = body.guide || {};
  const mcp = body.mcp || {};
  const blackboard = body.blackboard || {};
  const context = guide.context || {};

  return {
    ok: body.ok !== false,
    schema: "fractanet-ops-legacy",
    role: "runtime-aggregator",
    generated_at: body.generated_at || null,
    layers: {
      services: {
        fracta: {
          mcp: {
            ok: mcp.ok === true,
            error: mcp.error || null,
            version: mcp.version || null,
          },
          guide: {
            ok: guide.ok === true,
            error: guide.error || null,
            service: guide.service || null,
            model: guide.model || null,
          },
        },
      },
      blackboard: {
        store_path: blackboard.store_path || null,
        snapshot_at: blackboard.snapshot_at || null,
        attractor_count: blackboard.attractor_count ?? 0,
        fresh_attractor_count: blackboard.fresh_attractor_count ?? 0,
        attractors: blackboard.attractors || [],
        fresh_attractors: blackboard.fresh_attractors || [],
        recent_events: blackboard.recent_events || [],
      },
      retrieval: {
        backend: context.retrieval_backend || null,
        inox_configured: context.inox_retrieval?.configured === true,
        inox_url: context.inox_retrieval?.url || null,
        transport: context.inox_retrieval?.transport || null,
        phase2_wired: false,
      },
      public_face: {
        guide_url: "https://cogentia.fractavolta.com",
        aggregator_ok: body.ok === true,
      },
    },
    legacy: body,
    error: body.ok === false ? body.error : null,
  };
}

export function summarizeHealth({ runtime, mesh, drift, catalogue }) {
  const guideOk = runtime?.layers?.services?.fracta?.guide?.ok === true;
  const mcpOk = runtime?.layers?.services?.fracta?.mcp?.ok === true;
  const aggregatorOk = runtime?.ok === true;
  const freshAttractors = runtime?.layers?.blackboard?.fresh_attractor_count ?? 0;
  const retrievalBackend = runtime?.layers?.retrieval?.backend;
  const hasErrors = drift.some(item => item.severity === "error");

  let health_score = 0;
  let status = "unknown";
  let critical_path_ok = false;
  const degraded_reasons = [];

  if (!aggregatorOk) {
    health_score = 1;
    status = "broken";
    degraded_reasons.push("runtime aggregator unreachable");
  } else if (!guideOk && !mcpOk) {
    health_score = 1;
    status = "broken";
    degraded_reasons.push("Guide and MCP unhealthy");
  } else if (hasErrors) {
    health_score = 2;
    status = "fragile";
    degraded_reasons.push("operational errors detected");
    critical_path_ok = guideOk || mcpOk;
  } else {
    critical_path_ok = guideOk || mcpOk;
    health_score = 3;
    status = "functional";

    const laptopOnline = (mesh.peers || []).some(peer => peer.hostname === "i7-thinkpad-jhr" && peer.online);
    const expectsRetrieval = retrievalBackend === "inox-session";
    if (expectsRetrieval && laptopOnline && freshAttractors === 0) {
      health_score = 2;
      status = "fragile";
      degraded_reasons.push("inox-session configured but no fresh attractor");
    } else if (expectsRetrieval && freshAttractors > 0) {
      health_score = 4;
      status = "robust";
    }

    if ((catalogue.planned_nodes || []).length > 0) {
      degraded_reasons.push("planned nodes not yet joined");
    }
  }

  let headline = "Operational state collected";
  if (status === "broken") headline = "Critical path degraded or unreachable";
  else if (status === "fragile") headline = "Functional with fragility";
  else if (status === "robust") headline = "Guide up with live capable-host attractor";
  else if (status === "functional") headline = "Guide stack reachable";

  return {
    health_score,
    status,
    critical_path_ok,
    degraded_reasons,
    headline,
  };
}