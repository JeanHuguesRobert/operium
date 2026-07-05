export function formatWipHuman(result) {
  if (!result?.ok) {
    const lines = [`Operium WIP: ${result?.error || "failed"}`];
    if (result?.blocked_paths?.length) {
      lines.push("Blocked paths:");
      for (const item of result.blocked_paths) lines.push(`  - ${item}`);
    }
    if (result?.risks?.length) {
      lines.push("Risks:");
      for (const item of result.risks) lines.push(`  - ${item}`);
    }
    if (result?.next_actions?.length) {
      lines.push("Next actions:");
      for (const item of result.next_actions) lines.push(`  - ${item}`);
    }
    return lines.join("\n");
  }

  if (result.schema === "operium.wip.status.v1") return formatStatus(result);
  if (result.schema === "operium.wip.handoff.v1") return formatHandoff(result);
  if (result.schema === "operium.wip.resume.v1") return formatResume(result);
  return JSON.stringify(result, null, 2);
}

function formatStatus(result) {
  const tree = result.working_tree || {};
  const sync = result.sync || {};
  const repo = result.repo || {};
  return [
    `Operium WIP status: ${repo.name || "repo"}`,
    `Branch: ${repo.current_branch || "(detached)"}`,
    `HEAD: ${short(repo.head)}`,
    `Working tree: ${tree.clean ? "clean" : "dirty"}`,
    `Sync: ahead ${sync.ahead || 0}, behind ${sync.behind || 0}${sync.diverged ? " (diverged)" : ""}`,
    `WIP candidate: ${result.wip?.candidate_branch || "(none)"} (${result.wip?.reason || "none"})`,
    ...(result.risks?.length ? [`Risks: ${result.risks.join(", ")}`] : []),
    ...(result.next_actions?.length ? ["Next actions:", ...result.next_actions.map(item => `  - ${item}`)] : []),
  ].join("\n");
}

function formatHandoff(result) {
  const handoff = result.handoff || {};
  return [
    `Operium WIP handoff: ${result.repo?.branch}`,
    `Commit: ${handoff.created_commit ? short(handoff.commit) : "none"}`,
    `Pushed: ${handoff.pushed ? "yes" : "no"}`,
    `Clean after: ${result.working_tree?.clean_after ? "yes" : "no"}`,
    ...(result.next_actions?.length ? ["Next actions:", ...result.next_actions.map(item => `  - ${item}`)] : []),
  ].join("\n");
}

function formatResume(result) {
  return [
    `Operium WIP resume: ${result.repo?.branch}`,
    `HEAD: ${short(result.repo?.head)}`,
    `Commits recovered: ${result.resume?.commits_recovered ?? 0}`,
    `Working tree: ${result.working_tree?.clean ? "clean" : "dirty"}`,
    ...(result.next_actions?.length ? ["Next actions:", ...result.next_actions.map(item => `  - ${item}`)] : []),
  ].join("\n");
}

function short(value) {
  return value ? String(value).slice(0, 12) : "(none)";
}
