function statusGlyph(ok) {
  if (ok === true) return "OK";
  if (ok === false) return "FAIL";
  return "??";
}

export function formatNodeStatusHuman(status) {
  const lines = [];
  lines.push(`Operium Node Agent — ${status.hostname || status.node_id || "unknown"}`);
  lines.push(
    `Health ${status.health_score ?? "?"} · ok=${status.ok ? "yes" : "no"} · peers(fresh)=${status.peer_count_fresh ?? 0}`,
  );
  lines.push(`Node ${status.node_id || "?"} · uptime ${status.uptime_seconds ?? "?"}s · v${status.ona_version || "?"}`);
  lines.push("");

  const catalogue = status.catalogue || {};
  lines.push(
    `Catalogue  matched=${catalogue.matched ? "yes" : "no"}  ${catalogue.catalogue_hostname || catalogue.resource_id || "—"}`,
  );

  const probes = status.probes || {};
  lines.push(
    `Probes     applicable=${probes.applicable_count ?? 0} failed=${probes.failed_count ?? 0} last=${probes.last_at || "—"}`,
  );

  for (const probe of (probes.latest || []).slice(0, 6)) {
    lines.push(`  ${probe.probe_kind || "?"}  ${statusGlyph(probe.ok)}  ${probe.target || ""}`);
  }

  const stats = status.sqlite_stats || {};
  lines.push("");
  lines.push(
    `SQLite     probes=${stats.probe_history ?? 0} peers=${stats.peer_nodes ?? 0} events=${stats.event_log ?? 0} outbox=${stats.cop_outbox_pending ?? 0}`,
  );
  lines.push("");
  lines.push("JSON: operium node status --json");
  return lines.join("\n");
}

export function formatNodePeersHuman(peers) {
  const lines = [];
  lines.push(`ONA peers — ${peers.count ?? 0}${peers.fresh_only ? " (fresh only)" : ""}`);
  lines.push(`Self ${peers.node_id || "?"} · sync ${peers.last_blackboard_sync_at || "—"}`);
  lines.push("");

  for (const peer of peers.peers || []) {
    lines.push(
      `  ${peer.hostname || "?"}  ${peer.status || "?"}  fresh=${peer.fresh ? "yes" : "no"}  ${peer.endpoint || ""}`,
    );
  }

  if (!(peers.peers || []).length) lines.push("  (none)");
  lines.push("");
  lines.push("JSON: operium node peers --json");
  return lines.join("\n");
}

export function formatNodeDriftHuman(driftBody) {
  const lines = [];
  lines.push(`ONA drift — ${driftBody.hostname || driftBody.node_id || "unknown"}`);
  lines.push(`Health ${driftBody.health_score ?? "?"} · findings ${(driftBody.drift || []).length}`);
  lines.push("");

  for (const item of (driftBody.drift || []).slice(0, 8)) {
    lines.push(`  [${item.severity}] ${item.kind}: ${item.observed}`);
  }

  if (!(driftBody.drift || []).length) lines.push("  (none)");

  if ((driftBody.next_actions || []).length) {
    lines.push("");
    lines.push("Next:");
    for (const action of driftBody.next_actions.slice(0, 4)) {
      lines.push(`  - ${action}`);
    }
  }

  lines.push("");
  lines.push("JSON: operium node drift --json");
  return lines.join("\n");
}

export function formatNodeSnapshotHuman(snapshot) {
  const lines = [];
  lines.push(`ONA snapshot — ${snapshot.hostname || snapshot.node_id || "unknown"}`);
  lines.push(
    `Health ${snapshot.status?.health_score ?? "?"} · peers ${snapshot.peers?.length ?? 0} · probes ${snapshot.probe_history?.length ?? 0}`,
  );
  if (snapshot.cached) lines.push(`Cached at ${snapshot.fetched_at || "?"}`);
  lines.push("");
  lines.push("JSON: operium node snapshot --json");
  return lines.join("\n");
}

export function formatNodeDiagnoseHuman(diagnose) {
  const lines = [];
  lines.push(`Fractanet diagnose — ${diagnose.summary?.headline || "status"}`);
  lines.push(
    `Health ${diagnose.summary?.health_score ?? "?"} (${diagnose.summary?.status || "unknown"}) · critical_path=${diagnose.summary?.critical_path_ok ? "yes" : "no"}`,
  );

  const nodeAgent = diagnose.layers?.node_agent || {};
  if (nodeAgent.ok === false) {
    lines.push(`ONA         FAIL  ${nodeAgent.error || "unreachable"} @ ${nodeAgent.url || "?"}`);
  } else {
    lines.push(
      `ONA         OK    health=${nodeAgent.health_score ?? "?"} peers(fresh)=${nodeAgent.peer_count_fresh ?? 0} @ ${nodeAgent.url || "?"}`,
    );
  }

  const remote = diagnose.layers?.services?.remote?.fracta || {};
  const observer = diagnose.observer || {};
  lines.push(`Aggregator  ${statusGlyph(diagnose.layers?.public_face?.aggregator_reachable)}  ${observer.aggregator_url || "?"}`);
  lines.push(`Guide MCP   ${statusGlyph(remote.guide?.ok)}  backend=${diagnose.layers?.retrieval?.backend || "?"}`);
  lines.push(
    `Blackboard  fresh=${diagnose.layers?.blackboard?.fresh_attractor_count ?? 0} total=${diagnose.layers?.blackboard?.attractor_count ?? 0}`,
  );

  const mesh = diagnose.layers?.mesh || {};
  if (mesh.available) {
    const peers = (mesh.peers || []).map(peer => `${peer.hostname}:${peer.online ? "up" : "down"}`).join(", ");
    lines.push(`Tailnet     ${mesh.tailnet || "?"} · peers: ${peers || "none"}`);
  }

  if ((diagnose.drift || []).length) {
    lines.push("");
    lines.push("Drift:");
    for (const item of diagnose.drift.slice(0, 8)) {
      lines.push(`  [${item.severity}] ${item.kind}: ${item.observed}`);
    }
  }

  if ((diagnose.next_actions || []).length) {
    lines.push("");
    lines.push("Next:");
    for (const action of diagnose.next_actions.slice(0, 6)) {
      lines.push(`  - ${action}`);
    }
  }

  lines.push("");
  lines.push("JSON: operium node diagnose --json");
  return lines.join("\n");
}

export function formatNodeLogsHuman(logs) {
  const lines = [];
  lines.push(`ONA event log — ${logs.count ?? 0} events`);
  if (logs.kind_filter) lines.push(`Filter kind=${logs.kind_filter}`);
  lines.push("");

  for (const event of logs.events || []) {
    const detail = event.detail ? ` ${JSON.stringify(event.detail)}` : "";
    lines.push(`  ${event.logged_at || "?"}  ${event.kind || "?"}${detail}`);
  }

  if (!(logs.events || []).length) lines.push("  (none)");
  lines.push("");
  lines.push("JSON: operium node logs --json");
  return lines.join("\n");
}