#!/usr/bin/env node
/**
 * operium/scripts/ops/resume-recon.js
 *
 * Prototype for bare "resume":
 * 1. Reads intentional session anchor from JeanHuguesRobert/RESUME-SESSION.md
 * 2. Probes real-time operational state of Fractanet mesh & services (buildOperiumUp)
 * 3. Evaluates FixBugsFirst gate (evaluateGate)
 * 4. Checks Git branch divergence on touched repos
 * 5. Emits a synthesized re-entry brief for the Principal or Agent
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { buildOperiumUp } from "../../lib/operium-up.js";
import { loadBacklog, evaluateGate } from "../../lib/backlog.js";
import { runGit } from "../../lib/git-wip.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPERIUM_ROOT = path.resolve(__dirname, "../..");
const WORKSPACE_ROOT = path.resolve(OPERIUM_ROOT, "..");

export async function reconSession(options = {}) {
  const jsonMode = options.json || process.argv.includes("--json");
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
      const issueMatch = ref.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
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
  const reposToCheck = ["operium", "cogentia", "JeanHuguesRobert"];
  const gitDeltas = [];
  for (const repoName of reposToCheck) {
    const repoDir = path.resolve(WORKSPACE_ROOT, repoName);
    if (fs.existsSync(path.resolve(repoDir, ".git"))) {
      try {
        const branchRes = await runGit(["branch", "--show-current"], { cwd: repoDir, allowFailure: true });
        const statusRes = await runGit(["status", "-sb"], { cwd: repoDir, allowFailure: true });
        const firstLine = (statusRes.stdout || "").split("\n")[0] || "";
        const dirty = (statusRes.stdout || "").split("\n").length > 1;
        gitDeltas.push({
          repo: repoName,
          branch: branchRes.stdout || "(detached)",
          status_summary: firstLine,
          dirty,
        });
      } catch (e) {
        gitDeltas.push({ repo: repoName, error: e.message });
      }
    }
  }

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

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  // Human / Agent Presentation
  console.log("================================================================================");
  console.log("🔄 FRACTANET RE-ENTRY CONTEXT (Resume Recon)");
  console.log("================================================================================");
  
  if (canonicalIssue) {
    console.log(`\n📍 Last Active Issue: ${canonicalIssue.handle} (${canonicalIssue.url})`);
    console.log(`   Packet: ${anchor?.packet_id || "?"} [${anchor?.topic_id || "?"}]`);
    console.log(`   Date:   ${anchor?.date || "?"}`);
  } else {
    console.log("\n📍 Last Active Issue: (none found in RESUME-SESSION.md)");
  }

  console.log("\n⏱️  Entre-temps (Operational Delta):");
  console.log(`   - Mesh Health: Score ${result.operational_state.health_score} · ${result.operational_state.headline}`);
  console.log(`   - Guide Aggregator: ${result.operational_state.aggregator} · Guide MCP: ${result.operational_state.guide}`);
  if (result.operational_state.tailnet_peers.length > 0) {
    const peerSummary = result.operational_state.tailnet_peers
      .map(p => `${p.hostname}:${p.online ? "up" : "down"}`)
      .join(", ");
    console.log(`   - Tailscale Peers: ${peerSummary}`);
  }

  console.log("\n🛡️  FixBugsFirst Gate:");
  if (fbfGate?.blocked) {
    console.log(`   ⛔ BLOCKED in subsystem '${activeSubsystem}'!`);
    for (const bug of fbfGate.blocking_bugs) {
      console.log(`      * [${bug.id}] (${bug.severity}) ${bug.title} -> Next: ${bug.next_action}`);
    }
  } else {
    console.log(`   ✅ GREEN in subsystem '${activeSubsystem}' (No blocking critical/high bugs)`);
  }

  console.log("\n📂 Git Workspaces:");
  for (const g of gitDeltas) {
    const dirtyMarker = g.dirty ? " [dirty worktree]" : " [clean]";
    console.log(`   - ${g.repo.padEnd(16)}: ${g.branch} (${g.status_summary.replace(/^##\s*/, "")})${dirtyMarker}`);
  }

  console.log("\n🎯 Immediate Proposed Next Action:");
  if (fbfGate?.blocked) {
    console.log(`   Resolve blocking bug in '${activeSubsystem}' before resuming features.`);
  } else if (canonicalIssue) {
    console.log(`   Proceed with issue ${canonicalIssue.handle} or run 'gh issue view ${canonicalIssue.number} --repo ${canonicalIssue.owner}/${canonicalIssue.repo}'.`);
  } else {
    console.log("   Ready for operator instructions.");
  }
  console.log("================================================================================\n");

  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  reconSession();
}
