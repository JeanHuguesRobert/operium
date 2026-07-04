function statusGlyph(ok) {
  if (ok === true) return "OK";
  if (ok === false) return "FAIL";
  return "??";
}

export function formatHumanUp(result) {
  const lines = [];
  lines.push(`Fractanet / Operium — ${result.summary?.headline || "status"}`);
  lines.push(`Health ${result.summary?.health_score ?? "?"} (${result.summary?.status || "unknown"}) · critical_path=${result.summary?.critical_path_ok ? "yes" : "no"}`);
  lines.push("");

  const remote = result.layers?.services?.remote?.fracta || {};
  lines.push(`Aggregator  ${statusGlyph(result.layers?.public_face?.aggregator_reachable)}  ${result.observer?.aggregator_url}`);
  lines.push(`Guide MCP   ${statusGlyph(remote.guide?.ok)}  backend=${result.layers?.retrieval?.backend || "?"}`);
  lines.push(`Blackboard  fresh=${result.layers?.blackboard?.fresh_attractor_count ?? 0} total=${result.layers?.blackboard?.attractor_count ?? 0}`);

  const mesh = result.layers?.mesh || {};
  if (mesh.available) {
    const peers = (mesh.peers || []).map(peer => `${peer.hostname}:${peer.online ? "up" : "down"}`).join(", ");
    lines.push(`Tailnet     ${mesh.tailnet || "?"} · self=${mesh.hostname || "?"} · peers: ${peers || "none"}`);
  } else {
    lines.push(`Tailnet     unavailable${mesh.error ? ` (${mesh.error})` : ""}`);
  }

  const localInox = result.layers?.services?.local?.services?.inox_serve;
  if (localInox) {
    lines.push(`Local inox  ${statusGlyph(localInox.ok)}  ${localInox.url || ""}`);
  }

  if ((result.drift || []).length) {
    lines.push("");
    lines.push("Drift:");
    for (const item of result.drift.slice(0, 6)) {
      lines.push(`  [${item.severity}] ${item.kind}: ${item.observed}`);
    }
  }

  if ((result.next_actions || []).length) {
    lines.push("");
    lines.push("Next:");
    for (const action of result.next_actions.slice(0, 4)) {
      lines.push(`  - ${action}`);
    }
  }

  lines.push("");
  lines.push("JSON: operium up --json");
  return lines.join("\n");
}