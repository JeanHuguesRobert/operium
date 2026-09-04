/**
 * operium/lib/resume-session.js
 *
 * Implements the bare "resume" protocol:
 * 1. Reads intentional session anchor from JeanHuguesRobert/RESUME-SESSION.md
 * 2. Probes real-time operational state of Fractanet mesh & services (buildOperiumUp)
 * 3. Evaluates FixBugsFirst gate (evaluateGate)
 * 4. Checks Git branch divergence on active repos
 * 5. Emits a synthesized re-entry brief for the Principal or Agent
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { buildOperiumUp } from "./operium-up.js";
import { loadBacklog, evaluateGate } from "./backlog.js";
import { runGit } from "./git-wip.js";
import { resolveCorpusRepoNames } from "./paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPERIUM_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(OPERIUM_ROOT, "..");

export async function reconSession(options = {}) {
  const jsonMode = options.json || (!options.human && !process.stdout.isTTY && !options.cli);
  const jhrResumePath = path.resolve(WORKSPACE_ROOT, "JeanHuguesRobert/RESUME-SESSION.md");

  // 1. Read Intentional Session Anchor
  let anchor = null;
  if (fs.existsSync(jhrResumePath)) {
    const raw = fs.readFileSync(jhrResumePath, "utf8");
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (match) {
      try {
        const fm = YAML.parse(match[1]);
        anchor = {
          packet_id: fm.packet_id,
          topic_id: fm.topic_id,
          date: fm.date,
          causal_refs: fm.causal_refs || [],
          raw_frontmatter: fm,
        };
      } catch (err) {
        anchor = { error: `yaml_parse_error: ${err.message}` };
      }
    }
  }

  // Extract canonical issue if present in causal_refs
  let canonicalIssue = null;
  let activeSubsystem = "mesh"; // default
  if (anchor?.causal_refs) {
    for (const ref of anchor.causal_refs) {
      const issueMatch = String(ref).match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
      if (issueMatch) {
        canonicalIssue = {
          owner: issueMatch[1],
          repo: issueMatch[2],
          number: issueMatch[3],
          url: ref,
          handle: `${issueMatch[2]}/${issueMatch[3]}`,
        };
      }
    }
  }
  if (anchor?.topic_id?.includes("mesh") || anchor?.topic_id?.includes("topology")) {
    activeSubsystem = "mesh";
  } else if (anchor?.topic_id?.includes("secrets")) {
    activeSubsystem = "secrets";
  } else if (anchor?.topic_id?.includes("ona")) {
    activeSubsystem = "ona";
  }

  // 2. Real-time Operational Probe (Fractanet mesh & Guide)
  let operiumUp = null;
  try {
    operiumUp = await buildOperiumUp({
      timeoutMs: options.timeoutMs || 2500,
    });
  } catch (err) {
    operiumUp = { ok: false, error: err.message };
  }

  // 3. FixBugsFirst Gate Evaluation
  let fbfGate = null;
  try {
    const backlog = loadBacklog();
    fbfGate = evaluateGate(backlog, activeSubsystem);
  } catch (err) {
    fbfGate = { ok: false, error: err.message };
  }

  // 4. Git Workspace Reconnaissance (check active repos)
  const reposToCheck = resolveCorpusRepoNames(options);
  const validRepos = reposToCheck.filter(repoName => {
    const repoDir = path.resolve(WORKSPACE_ROOT, repoName);
    return fs.existsSync(path.resolve(repoDir, ".git"));
  });
  const gitDeltas = await Promise.all(
    validRepos.map(async repoName => {
      const repoDir = path.resolve(WORKSPACE_ROOT, repoName);
      try {
        const branchRes = await runGit(["branch", "--show-current"], { cwd: repoDir, allowFailure: true });
        const statusRes = await runGit(["status", "-sb"], { cwd: repoDir, allowFailure: true });
        const firstLine = (statusRes.stdout || "").split("\n")[0] || "";
        const dirty = (statusRes.stdout || "").split("\n").length > 1;
        return {
          repo: repoName,
          branch: branchRes.stdout || "(detached)",
          status_summary: firstLine,
          dirty,
        };
      } catch (e) {
        return { repo: repoName, error: e.message };
      }
    })
  );

  const result = {
    schema: "operium.resume_recon.v1",
    timestamp: new Date().toISOString(),
    anchor: anchor || { status: "no_resume_session_found" },
    canonical_issue: canonicalIssue,
    active_subsystem: activeSubsystem,
    fbf_gate: fbfGate,
    operational_state: {
      health_score: operiumUp?.summary?.health_score ?? "?",
      headline: operiumUp?.summary?.headline ?? "unknown",
      aggregator: operiumUp?.layers?.aggregator?.status ?? "unknown",
      guide: operiumUp?.layers?.retrieval?.guide?.status ?? "unknown",
      tailnet_peers: operiumUp?.layers?.mesh?.peers?.map(p => ({ hostname: p.hostname, online: p.online })) || [],
    },
    git_deltas: gitDeltas,
  };

  return result;
}

export function formatResumeHuman(result) {
  const lines = [
    "================================================================================",
    "🔄 FRACTANET RE-ENTRY CONTEXT (Resume Recon)",
    "================================================================================",
  ];

  if (result.canonical_issue) {
    lines.push(`\n📍 Last Active Issue: ${result.canonical_issue.handle} (${result.canonical_issue.url})`);
    lines.push(`   Packet: ${result.anchor?.packet_id || "?"} [${result.anchor?.topic_id || "?"}]`);
    lines.push(`   Date:   ${result.anchor?.date || "?"}`);
  } else {
    lines.push("\n📍 Last Active Issue: (none found in RESUME-SESSION.md)");
  }

  lines.push("\n⏱️  Entre-temps (Operational Delta):");
  lines.push(`   - Mesh Health: Score ${result.operational_state.health_score} · ${result.operational_state.headline}`);
  lines.push(`   - Guide Aggregator: ${result.operational_state.aggregator} · Guide MCP: ${result.operational_state.guide}`);
  if (result.operational_state.tailnet_peers.length > 0) {
    const peerSummary = result.operational_state.tailnet_peers
      .map(p => `${p.hostname}:${p.online ? "up" : "down"}`)
      .join(", ");
    lines.push(`   - Tailscale Peers: ${peerSummary}`);
  }

  lines.push("\n🛡️  FixBugsFirst Gate:");
  if (result.fbf_gate?.blocked) {
    lines.push(`   ⛔ BLOCKED in subsystem '${result.active_subsystem}'!`);
    for (const bug of result.fbf_gate.blocking_bugs || []) {
      lines.push(`      * [${bug.id}] (${bug.severity}) ${bug.title} -> Next: ${bug.next_action}`);
    }
  } else {
    lines.push(`   ✅ GREEN in subsystem '${result.active_subsystem}' (No blocking critical/high bugs)`);
  }

  lines.push("\n📂 Git Workspaces:");
  for (const g of result.git_deltas) {
    const dirtyMarker = g.dirty ? " [dirty worktree]" : " [clean]";
    lines.push(`   - ${g.repo.padEnd(16)}: ${g.branch} (${g.status_summary.replace(/^##\s*/, "")})${dirtyMarker}`);
  }

  lines.push("\n🎯 Immediate Proposed Next Action:");
  if (result.fbf_gate?.blocked) {
    lines.push(`   Resolve blocking bug in '${result.active_subsystem}' before resuming features.`);
  } else if (result.canonical_issue) {
    lines.push(`   Proceed with issue ${result.canonical_issue.handle} or run 'gh issue view ${result.canonical_issue.number} --repo ${result.canonical_issue.owner}/${result.canonical_issue.repo}'.`);
  } else {
    lines.push("   Ready for operator instructions.");
  }
  lines.push("================================================================================\n");

  return lines.join("\n");
}
