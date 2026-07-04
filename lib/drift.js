const OPEN_DECISIONS = [
  {
    id: "fallback-policy-abc",
    topic: "Capable host offline",
    options: ["A supabase fallback", "B degraded only", "C attractor routing + policy"],
    recommendation: "C long-term; A transitional",
    doc: "operium/research/fractanet-resumption-2026-07.md",
  },
  {
    id: "phase-2-routing",
    topic: "Blackboard-aware Guide routing",
    status: "specified_not_implemented",
    doc: "cogentia/scripts/cogentia-mcp-http.js",
  },
];

export function computeDrift(context = {}) {
  const drift = [];
  const { catalogue, mesh, runtime, local } = context;

  for (const planned of catalogue.planned_nodes || []) {
    const onTailnet = (mesh.peers || []).some(peer => peer.hostname === planned && peer.online);
    if (!onTailnet) {
      drift.push({
        kind: "catalogue_vs_live",
        severity: "info",
        fact: `registry expects planned node ${planned}`,
        observed: "not present on tailnet",
        doc: "operium/docs/fractanet-mesh.md",
      });
    }
  }

  for (const node of catalogue.nodes || []) {
    if (!node.hostname) continue;
    const peer = (mesh.peers || []).find(item => item.hostname === node.hostname);
    if (mesh.available && !peer) {
      drift.push({
        kind: "catalogue_vs_live",
        severity: node.intermittent ? "info" : "warn",
        fact: `catalogue lists ${node.hostname}`,
        observed: "missing from tailscale status",
        doc: "operium/docs/fractanet-mesh.md",
      });
    }
    if (peer && !peer.online && !node.intermittent) {
      drift.push({
        kind: "node_offline",
        severity: "warn",
        fact: `${node.hostname} expected online`,
        observed: "tailscale peer offline",
      });
    }
    for (const secret of node.secrets || []) {
      if (secret.file_exists === false) {
        drift.push({
          kind: "secret_ref_missing",
          severity: "warn",
          fact: `secret ref ${secret.id}`,
          observed: `file missing at ${secret.stored_in}`,
        });
      }
    }
  }

  const freshCount = runtime?.layers?.blackboard?.fresh_attractor_count
    ?? runtime?.blackboard?.fresh_attractor_count
    ?? 0;
  const laptopPeer = (mesh.peers || []).find(peer => peer.hostname === "i7-thinkpad-jhr");
  if (laptopPeer?.online && freshCount === 0) {
    drift.push({
      kind: "blackboard_stale",
      severity: "warn",
      fact: "capable host online on tailnet",
      observed: "no fresh attractor on blackboard",
    });
  }

  const phase2Wired = runtime?.layers?.retrieval?.phase2_wired;
  if (phase2Wired === false) {
    drift.push({
      kind: "intended_vs_current",
      severity: "info",
      fact: "Phase 2 blackboard routing specified",
      observed: "Guide uses static backend resolution",
      doc: "operium/research/fractanet-resumption-2026-07.md",
    });
  }

  if (local?.services?.inox_serve && local.services.inox_serve.ok === false) {
    drift.push({
      kind: "local_service_down",
      severity: "warn",
      fact: "local inox-serve expected on capable host",
      observed: local.services.inox_serve.error || "health check failed",
    });
  }

  if (!runtime?.ok) {
    drift.push({
      kind: "aggregator_unreachable",
      severity: "error",
      fact: "runtime aggregator should be reachable",
      observed: runtime?.error || "fetch failed",
    });
  }

  return drift;
}

export function openDecisions() {
  return OPEN_DECISIONS.map(item => ({ ...item }));
}

export function nextActions(drift = [], summary = {}) {
  const actions = [];
  if (summary.critical_path_ok === false) {
    actions.push("Restore fracta Guide MCP or aggregator reachability.");
  }
  for (const item of drift) {
    if (item.kind === "blackboard_stale") {
      actions.push("Check CogentiaAttractorHeartbeat task and COGENTIA_BLACKBOARD_URL on capable host.");
    }
    if (item.kind === "catalogue_vs_live" && String(item.fact).includes("rpi3-view")) {
      actions.push("Bootstrap rpi3-view with fractanet-node-bootstrap.sh when LAN IP is known.");
    }
    if (item.kind === "secret_ref_missing") {
      actions.push(`Restore secret file for ${item.fact}.`);
    }
    if (item.kind === "local_service_down") {
      actions.push("Restart InoxServeCapableHost scheduled task or inox-serve process.");
    }
  }
  if (actions.length === 0 && summary.health_score <= 2) {
    actions.push("Review operium/docs/fractanet-mesh.md operator checklist.");
  }
  return [...new Set(actions)];
}