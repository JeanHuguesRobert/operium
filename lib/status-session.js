/**
 * operium/lib/status-session.js
 *
 * Implements the session "status" protocol (sitrep):
 * 1. Pure read-only, non-mutating inspection of session and infrastructure
 * 2. Reads session anchor from JeanHuguesRobert/RESUME-SESSION.md
 * 3. Inspects Git workspaces (branch, ahead/behind, dirty counts)
 * 4. Probes real-time Fractanet mesh health & Tailscale peers
 * 5. Evaluates the FixBugsFirst gate on the active subsystem
 * 6. Emits a synthesized situational report (sitrep)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { getGitRepoStatus } from "./git-wip.js";
import { buildOperiumUp } from "./operium-up.js";
import { loadBacklog, evaluateGate } from "./backlog.js";
import { getCogentiaSemanticContext, formatCogentiaStatus } from "./cogentia-bridge.js";
import { resolveCorpusRepoNames } from "./paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPERIUM_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(OPERIUM_ROOT, "..");

export async function statusSession(options = {}) {
  const jhrResumePath = path.resolve(WORKSPACE_ROOT, "JeanHuguesRobert/RESUME-SESSION.md");

  // 1. Read Sovereign Session Anchor
  let anchor = null;
  if (fs.existsSync(jhrResumePath)) {
    try {
      const raw = fs.readFileSync(jhrResumePath, "utf8");
      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (match) {
        const fm = YAML.parse(match[1]);
        anchor = {
          packet_id: fm.packet_id,
          topic_id: fm.topic_id,
          epistemic_status: fm.epistemic_status || "active",
          date: fm.date,
          causal_refs: fm.causal_refs || [],
          raw: fm,
        };
      }
    } catch {
      // ignore
    }
  }

  let canonicalIssue = null;
  let activeSubsystem = "mesh";
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

  // 2. Git Workspaces Status
  const reposToScan = resolveCorpusRepoNames(options);
  const validRepos = reposToScan.filter(name => {
    const rDir = path.resolve(WORKSPACE_ROOT, name);
    return fs.existsSync(path.resolve(rDir, ".git"));
  });
  const workspaces = await Promise.all(
    validRepos.map(async name => {
      const rDir = path.resolve(WORKSPACE_ROOT, name);
      try {
        const st = await getGitRepoStatus(rDir);
        return {
          name,
          branch: st.repo?.current_branch || "(detached)",
          head: st.repo?.head ? st.repo.head.slice(0, 7) : "?",
          clean: st.working_tree?.clean === true,
          modified_count: (st.working_tree?.modified || []).length,
          untracked_count: (st.working_tree?.untracked || []).length,
          ahead: st.repo?.ahead || 0,
          behind: st.repo?.behind || 0,
        };
      } catch {
        return { name, error: "status_failed" };
      }
    })
  );

  // 3. Fractanet Mesh Status
  let meshInfo = null;
  try {
    const opUp = await buildOperiumUp({
      timeoutMs: options.timeoutMs || 2000,
      probe: options.probe !== false,
    });
    meshInfo = {
      score: opUp?.summary?.health_score ?? 0,
      status: opUp?.summary?.status || "unknown",
      headline: opUp?.summary?.headline || "",
      peers_online: (opUp?.layers?.mesh?.peers || []).filter(p => p.online).map(p => p.hostname),
    };
  } catch (err) {
    meshInfo = { error: err.message };
  }

  // 4. FixBugsFirst Gate Evaluation
  let fbfGate = null;
  try {
    const backlog = loadBacklog();
    fbfGate = evaluateGate(backlog, activeSubsystem);
  } catch (err) {
    fbfGate = { ok: false, error: err.message };
  }

  // 5. Cogentia Semantic Context (Mind bridge)
  let cogentia = null;
  try {
    cogentia = await getCogentiaSemanticContext({
      issueHandle: canonicalIssue?.handle,
      timeoutMs: options.timeoutMs || 300,
    });
  } catch {
    cogentia = { ok: false, bridge: { mode: "none" } };
  }

  return {
    schema: "operium.session_status.v1",
    ok: true,
    timestamp: new Date().toISOString(),
    session: {
      epistemic_status: anchor?.epistemic_status || "unknown",
      packet_id: anchor?.packet_id || null,
      topic_id: anchor?.topic_id || "topic:workspace-continuation",
      canonical_issue: canonicalIssue,
      anchor_date: anchor?.date || null,
    },
    workspaces,
    mesh: meshInfo,
    fbf_gate: fbfGate,
    cogentia,
  };
}

export function formatStatusHuman(result) {
  const lines = [];
  lines.push("================================================================================");
  lines.push("🧭 FRACTANET SITREP / SESSION STATUS");
  lines.push("================================================================================");
  lines.push("");

  // 1. L'Intention
  lines.push("1. 📍 L'INTENTION (Anchor & Session):");
  const s = result.session || {};
  lines.push(`   - Session State  : ${(s.epistemic_status || "active").toUpperCase()}`);
  if (s.canonical_issue) {
    lines.push(`   - Issue Active   : ${s.canonical_issue.handle} (${s.canonical_issue.url})`);
  }
  lines.push(`   - Sujet / Topic  : ${s.topic_id || "workspace-continuation"}`);
  if (s.packet_id) {
    lines.push(`   - Dernier Paquet : ${s.packet_id}${s.anchor_date ? ` (${s.anchor_date})` : ""}`);
  }
  lines.push("");

  // 2. La Matière
  lines.push("2. 📂 LA MATIÈRE (Workspaces Git):");
  for (const w of result.workspaces || []) {
    if (w.error) {
      lines.push(`   - ${w.name.padEnd(16)}: [error: ${w.error}]`);
      continue;
    }
    const syncStr = w.ahead > 0 ? `ahead ${w.ahead}` : (w.behind > 0 ? `behind ${w.behind}` : "synced");
    const dirtyStr = w.clean ? "clean" : `dirty (${w.modified_count}M, ${w.untracked_count}??)`;
    lines.push(`   - ${w.name.padEnd(16)}: ${w.branch.padEnd(20)} [${syncStr}, ${dirtyStr}] (head ${w.head})`);
  }
  lines.push("");

  // 3. L'Environnement
  lines.push("3. 🌐 L'ENVIRONNEMENT (Mesh & Services):");
  if (result.mesh?.peers_online?.length > 0) {
    lines.push(`   - Peers Online   : ${result.mesh.peers_online.join(", ")}`);
  }
  if (result.mesh?.score !== undefined) {
    lines.push(`   - Health Score   : ${result.mesh.score} · ${result.mesh.headline || result.mesh.status}`);
  }
  lines.push("");

  // 4. La Boussole
  lines.push("4. 🛡️  LA BOUSSOLE (FixBugsFirst Gate):");
  if (result.fbf_gate?.blocked) {
    lines.push(`   ⛔ BLOCKED in subsystem '${result.fbf_gate.subsystem}'!`);
    lines.push(`      Critical bugs: ${result.fbf_gate.critical_count} | High bugs: ${result.fbf_gate.high_count}`);
  } else {
    lines.push(`   ✅ GREEN in subsystem '${result.fbf_gate?.subsystem || "mesh"}' (0 blocking bugs)`);
  }
  lines.push("");

  // 5. Le Sens
  lines.push("5. 🧠 LE SENS (Cogentia Semantic Layer):");
  lines.push(`   - Pont Sémantique: ${formatCogentiaStatus(result.cogentia)}`);
  if (result.cogentia?.semantics?.continuations_count > 0) {
    lines.push(`   - Continuations  : ${result.cogentia.semantics.continuations_count} active(s)`);
  }
  lines.push("");
  lines.push("================================================================================");
  lines.push("💡 Prochaines actions : tapez 'operium next?' (ou dans le chat 'next?') pour délibérer.");
  lines.push("================================================================================");
  lines.push("");

  return lines.join("\n");
}
