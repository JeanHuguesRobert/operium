export async function handleNodeProbe(deps = {}) {
  const runProbe = deps.runProbe;
  if (typeof runProbe !== "function") {
    return {
      status: 503,
      body: { ok: false, error: "probe_unavailable" },
    };
  }

  const result = await runProbe({ log: true });
  if (!result.ok && result.error === "probe_cycle_in_progress") {
    return {
      status: 409,
      body: { ok: false, error: "probe_cycle_in_progress" },
    };
  }

  if (!result.ok) {
    return {
      status: 500,
      body: {
        ok: false,
        error: result.error || "probe_failed",
        message: result.message || null,
      },
    };
  }

  return {
    status: 200,
    body: {
      schema: "operium.node.probe.v1",
      ok: true,
      node_id: result.identity?.node_id || deps.nodeId || null,
      hostname: result.identity?.hostname || deps.config?.hostname || null,
      health_score: result.summary?.health_score ?? null,
      probe_count: result.summary?.probe_count ?? null,
      failed_count: result.summary?.failed_count ?? null,
      peer_sync: result.peer_sync || null,
      ttl_sweep: result.ttl_sweep || null,
      cop_delivery: result.cop_delivery || null,
      generated_at: new Date().toISOString(),
    },
  };
}