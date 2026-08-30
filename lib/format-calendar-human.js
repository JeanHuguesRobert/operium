export function formatCalendarHuman(projection) {
  const lines = [];
  const summary = projection.summary || {};
  lines.push(`FractaCalendar — ${projection.hostname || projection.node_id || "projection"}`);
  lines.push(
    `Items ${summary.total ?? 0} · active ${summary.active ?? 0} · escalated ${summary.escalated ?? 0} · closed ${summary.closed ?? 0}`,
  );
  lines.push("Projection only. This view does not authorize or execute work.");
  lines.push("");

  const items = projection.items || [];
  if (!items.length) {
    lines.push("  (none)");
  }

  for (const item of items) {
    const when = item.next_run_at || item.deadline || "—";
    const evidence = item.last_evidence?.matched != null
      ? ` matched=${item.last_evidence.matched ? "yes" : "no"}`
      : "";
    lines.push(
      `  ${item.status.padEnd(9)} ${item.kind.padEnd(12)} ${item.id}  next=${when}${evidence}`,
    );
    lines.push(`           source=${item.source_of_truth}  ${item.service || "—"}/${item.project || "—"}`);
  }

  const views = projection.views || {};
  lines.push("");
  lines.push(`Views  nodes=${countKeys(views.by_node)} services=${countKeys(views.by_service)} projects=${countKeys(views.by_project)}`);
  lines.push("");
  lines.push("JSON: operium calendar list --json");
  return lines.join("\n");
}

function countKeys(object) {
  return object ? Object.keys(object).length : 0;
}
