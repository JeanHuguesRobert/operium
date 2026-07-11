import { buildOperiumUp, exitCodeForUp } from "./operium-up.js";
import { fetchOnaEndpoint, resolveOnaUrl } from "./node-cli.js";

export function mergeNextActions(operiumActions = [], onaActions = []) {
  const seen = new Set();
  const merged = [];

  for (const action of operiumActions) {
    const value = String(action || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    merged.push(value);
  }

  for (const action of onaActions) {
    const value = String(action || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    merged.push(value);
  }

  return merged;
}

export async function buildNodeDiagnose(options = {}) {
  const operiumUp = options.operiumUp || await buildOperiumUp({
    probe: options.probe !== false,
    registryPath: options.registryPath,
    aggregatorUrl: options.aggregatorUrl,
    timeoutMs: options.timeoutMs,
    env: options.env,
    hostname: options.hostname,
    fetch: options.fetch,
    probeTailscale: options.probeTailscale,
    probeLocalServices: options.probeLocalServices,
  });

  const onaBase = resolveOnaUrl(options);
  const onaStatus = options.onaStatusResult || await fetchOnaEndpoint("/node/status", options);
  const onaDrift = options.onaDriftResult || await fetchOnaEndpoint("/node/drift", options);

  const onaDriftItems = onaDrift.ok
    ? (onaDrift.body.drift || []).map(item => ({ ...item, source: "node_agent" }))
    : [];
  const drift = [
    ...(operiumUp.drift || []).map(item => ({ ...item, source: item.source || "operium_up" })),
    ...onaDriftItems,
  ];

  const onaActions = onaDrift.ok ? (onaDrift.body.next_actions || []) : [];
  const next_actions = mergeNextActions(operiumUp.next_actions, onaActions);

  const nodeAgent = buildNodeAgentLayer(onaStatus, onaBase);
  const summary = mergeDiagnoseSummary(operiumUp.summary, nodeAgent, onaDrift);

  return {
    schema: "operium.node.diagnose.v1",
    ok: operiumUp.ok !== false && nodeAgent.ok !== false,
    generated_at: new Date().toISOString(),
    role: "observer",
    observer: {
      ...(operiumUp.observer || {}),
      ona_url: onaBase,
      probe_mode: operiumUp.observer?.probe_mode || (options.probe === false ? "catalogue_only" : "active"),
    },
    summary,
    layers: {
      ...(operiumUp.layers || {}),
      node_agent: nodeAgent,
    },
    drift,
    open_decisions: operiumUp.open_decisions || [],
    next_actions,
    node_status: onaStatus.ok ? onaStatus.body : null,
    node_drift: onaDrift.ok ? onaDrift.body : null,
    sources: [
      ...(operiumUp.sources || []),
      {
        type: "ona",
        url: `${onaBase}/node/status`,
        ok: onaStatus.ok,
        status: onaStatus.status || null,
      },
      {
        type: "ona",
        url: `${onaBase}/node/drift`,
        ok: onaDrift.ok,
        status: onaDrift.status || null,
      },
    ],
  };
}

export function exitCodeForDiagnose(result) {
  if (!result || result.schema !== "operium.node.diagnose.v1") return 2;
  if (result.observer?.probe_mode === "catalogue_only") return 3;

  const upComparable = {
    schema: "operium.up.v1",
    observer: { probe_mode: result.observer?.probe_mode || "active" },
    summary: {
      critical_path_ok: result.summary?.critical_path_ok,
      health_score: result.summary?.health_score,
    },
  };
  const upCode = exitCodeForUp(upComparable);

  const nodeAgent = result.layers?.node_agent;
  if (nodeAgent?.ok === false) return Math.max(upCode, 2);

  const nodeHealth = Number(nodeAgent?.health_score);
  if (Number.isFinite(nodeHealth)) {
    if (nodeHealth <= 2) return Math.max(upCode, 2);
    if (nodeHealth === 3) return Math.max(upCode, 1);
  }

  return upCode;
}

function buildNodeAgentLayer(onaStatus, onaBase) {
  if (!onaStatus?.ok) {
    return {
      ok: false,
      url: onaBase,
      error: onaStatus?.error || "ona_unreachable",
      http_status: onaStatus?.status || null,
    };
  }

  const body = onaStatus.body || {};
  return {
    ok: body.ok !== false,
    url: onaStatus.url || `${onaBase}/node/status`,
    node_id: body.node_id || null,
    hostname: body.hostname || null,
    health_score: body.health_score ?? null,
    peer_count_fresh: body.peer_count_fresh ?? null,
    ona_version: body.ona_version || null,
    uptime_seconds: body.uptime_seconds ?? null,
    last_probe_at: body.probes?.last_at || null,
    last_blackboard_sync_at: body.last_blackboard_sync_at || null,
    sqlite_stats: body.sqlite_stats || null,
  };
}

function mergeDiagnoseSummary(operiumSummary = {}, nodeAgent = {}, onaDrift = {}) {
  const observerHealth = Number(operiumSummary.health_score ?? 0);
  const nodeHealth = Number(nodeAgent.health_score ?? observerHealth);
  const health_score = Math.min(observerHealth, Number.isFinite(nodeHealth) ? nodeHealth : observerHealth);

  const onaErrors = onaDrift.ok
    ? (onaDrift.body.drift || []).some(item => item.severity === "error")
    : false;

  return {
    ...operiumSummary,
    health_score,
    node_agent_ok: nodeAgent.ok === true,
    node_agent_health_score: nodeAgent.health_score ?? null,
    critical_path_ok: operiumSummary.critical_path_ok !== false && !onaErrors,
    headline: buildDiagnoseHeadline(operiumSummary, nodeAgent),
  };
}

function buildDiagnoseHeadline(operiumSummary, nodeAgent) {
  const base = operiumSummary.headline || operiumSummary.status || "Fractanet diagnose";
  if (nodeAgent.ok === false) return `${base} · ONA unreachable`;
  if (nodeAgent.ok === true && nodeAgent.health_score != null && nodeAgent.health_score < 3) {
    return `${base} · ONA degraded`;
  }
  return base;
}