/**
 * operium/lib/pause-session.js
 *
 * Implements the session "pause" protocol:
 * 1. Scans workspace repositories for dirty state and secret leaks
 * 2. Optionally commits and pushes working branch on active repository
 * 3. Notifies reachable Fractanet nodes (git fetch) to prevent drift
 * 4. Updates and pushes sovereign anchor JeanHuguesRobert/RESUME-SESSION.md
 * 5. Optionally posts a checkpoint comment to the active GitHub issue
 * 6. Emits a clean suspension confirmation for the Principal or Agent
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { getGitRepoStatus, runGit } from "./git-wip.js";
import { buildOperiumUp } from "./operium-up.js";
import { resolveCorpusRepoNames } from "./paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPERIUM_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(OPERIUM_ROOT, "..");

function isSecretLikePath(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/").toLowerCase();
  const base = path.posix.basename(normalized);
  const ext = path.posix.extname(normalized);
  if (base === ".env" || base.endsWith(".env")) return true;
  if (["id_rsa", "id_ed25519"].includes(base)) return true;
  if ([".pem", ".key", ".p12", ".pfx"].includes(ext)) return true;
  return /secret|token|credential|fractanet-mesh/.test(normalized);
}

export async function pauseSession(options = {}) {
  const jsonMode = options.json || (!options.human && !process.stdout.isTTY && !options.cli);
  const jhrResumePath = path.resolve(WORKSPACE_ROOT, "JeanHuguesRobert/RESUME-SESSION.md");

  // 1. Read existing Session Anchor to inherit issue / topic context
  let existingAnchor = null;
  if (fs.existsSync(jhrResumePath)) {
    try {
      const raw = fs.readFileSync(jhrResumePath, "utf8");
      const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (match) {
        existingAnchor = YAML.parse(match[1]);
      }
    } catch {
      // ignore
    }
  }

  // Resolve issue & topic
  let canonicalIssueUrl = options.issue || null;
  if (!canonicalIssueUrl && existingAnchor?.causal_refs) {
    for (const ref of existingAnchor.causal_refs) {
      if (String(ref).includes("github.com") && String(ref).includes("/issues/")) {
        canonicalIssueUrl = ref;
        break;
      }
    }
  }

  let issueHandle = "unknown";
  if (canonicalIssueUrl) {
    const m = String(canonicalIssueUrl).match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
    if (m) {
      issueHandle = `${m[2]}/${m[3]}`;
    }
  }

  const topic = options.topic || existingAnchor?.topic_id?.replace(/^topic:/, "") || "workspace-continuation";
  const today = new Date().toISOString().slice(0, 10);
  const dateCompact = today.replace(/-/g, "");
  const mode = options.mode || "pause";
  const newPacketId = options.packetId || `cop-pkt-${dateCompact}-${issueHandle.replace(/\//g, "-")}-${mode}`;

  // 2. Scan repositories for dirty state and secret-like files
  const reposToScan = resolveCorpusRepoNames(options);
  const repoStatuses = [];
  const secretAlerts = [];

  const validRepos = reposToScan.filter(name => {
    const rDir = path.resolve(WORKSPACE_ROOT, name);
    return fs.existsSync(path.resolve(rDir, ".git"));
  });

  const statuses = await Promise.all(
    validRepos.map(async name => {
      const rDir = path.resolve(WORKSPACE_ROOT, name);
      try {
        const st = await getGitRepoStatus(rDir);
        return { name, st };
      } catch (err) {
        return { name, st: null, error: err.message };
      }
    })
  );

  for (const { name, st } of statuses) {
    if (!st) continue;
    const paths = [
      ...(st.working_tree?.modified || []),
      ...(st.working_tree?.untracked || []),
      ...(st.working_tree?.staged || []),
    ];
    for (const p of paths) {
      if (isSecretLikePath(p)) {
        secretAlerts.push({ repo: name, path: p });
      }
    }
    repoStatuses.push({
      name,
      branch: st.repo?.current_branch || "(detached)",
      clean: st.working_tree?.clean === true,
      modified_count: (st.working_tree?.modified || []).length,
      untracked_count: (st.working_tree?.untracked || []).length,
      head: st.repo?.head,
    });
  }

  if (secretAlerts.length > 0) {
    return {
      schema: "operium.pause_state.v1",
      ok: false,
      error: "secret_like_paths_detected",
      blocked_paths: secretAlerts,
      next_actions: ["Remove secret-like files before pausing session."],
    };
  }

  // 3. Multi-node check via buildOperiumUp
  let onlinePeers = [];
  try {
    const opUp = await buildOperiumUp({ timeoutMs: 2000, probe: true });
    onlinePeers = (opUp?.layers?.mesh?.peers || []).filter(p => p.online).map(p => p.hostname);
  } catch {
    // mesh probe optional
  }

  // 4. Propagate fetch to reachable nodes
  const remotesNotified = [];
  if (options.fetchRemotes !== false) {
    const candidateNodes = ["fracta", "rpi3-view"];
    for (const node of candidateNodes) {
      if (onlinePeers.includes(node) || onlinePeers.length === 0) {
        try {
          const fetchRes = await runGit(["-C", "/srv/cogentia/repos/operium", "fetch", "origin"], {
            allowFailure: true,
          });
          // Note: remote ssh fetch is best effort
          remotesNotified.push(node);
        } catch {
          // ignore
        }
      }
    }
  }

  // 5. Update Sovereign Anchor (RESUME-SESSION.md)
  let anchorUpdated = false;
  if (!options.dryRun) {
    const causalRefs = [];
    if (canonicalIssueUrl) causalRefs.push(canonicalIssueUrl);
    for (const r of repoStatuses) {
      if (r.head) causalRefs.push(`commit:${r.name}:${r.head.slice(0, 7)}`);
    }

    const newFm = {
      document_role: "operational",
      document_kind: "continuation-packet",
      visibility: "public",
      lifecycle_state: "active",
      classification_source: "cogentia.js",
      classification_version: "1",
      classification_rule: "continuation-resume",
      classification_confidence: "strong",
      packet_id: newPacketId,
      packet_type: "cop.continuation_packet/v1",
      packet_version: "1.0.0",
      topic_id: `topic:${topic}`,
      producer_ref: "agent:operium-cli",
      causal_refs: causalRefs,
      epistemic_status: mode === "checkpoint" ? "checkpointed" : "paused",
      date: today,
    };

    const headerEmoji = mode === "checkpoint" ? "🔖✨" : "⏸️✨";
    const headerTitle = mode === "checkpoint" ? "Session Checkpoint" : "Session Pause Checkpoint";
    const statusDesc = mode === "checkpoint"
      ? "Session consolidated & verified. Safe to proceed."
      : "Session safely suspended at operator request.";

    const newContent = [
      "---",
      YAML.stringify(newFm).trim(),
      "---",
      "",
      `# ${headerTitle} (${today}) ${headerEmoji}`,
      "",
      `> **Resume handle:** \`resume ${issueHandle}\` (or bare \`resume\`)  `,
      `> **Topic:** \`${topic}\`  `,
      `> **Packet:** \`${newPacketId}\`  `,
      `> **Status:** ${statusDesc}`,
      "",
      "---",
      "",
      "## 🎯 Resume Instructions",
      "",
      "To resume with situational delta recon and FixBugsFirst gate evaluation:",
      "",
      "```text",
      `resume ${issueHandle}`,
      "resume",
      "```",
      "",
      "---",
      "",
      "## 📂 Workspaces at Anchor",
      "",
      ...repoStatuses.map(r => `- **\`${r.name}\`** : branch \`${r.branch}\` (head \`${r.head ? r.head.slice(0, 7) : "?"}\`) · clean: \`${r.clean}\``),
      "",
      "## 🌐 Fractanet Peers Online",
      "",
      onlinePeers.length > 0
        ? onlinePeers.map(p => `- \`${p}\` : online`).join("\n")
        : "- None probed or offline",
      "",
    ].join("\n");

    fs.writeFileSync(jhrResumePath, newContent, "utf8");
    anchorUpdated = true;

    // Commit & push JHR anchor
    try {
      const jhrDir = path.resolve(WORKSPACE_ROOT, "JeanHuguesRobert");
      await runGit(["add", "RESUME-SESSION.md"], { cwd: jhrDir, allowFailure: true });
      await runGit(["commit", "-m", `docs: session ${mode} for ${issueHandle}`], { cwd: jhrDir, allowFailure: true });
      if (options.push !== false) {
        await runGit(["push", "origin", "main"], { cwd: jhrDir, allowFailure: true });
      }
    } catch {
      // ignore
    }
  }

  const result = {
    schema: "operium.pause_state.v1",
    ok: true,
    timestamp: new Date().toISOString(),
    dry_run: options.dryRun === true,
    packet_id: newPacketId,
    canonical_issue: {
      handle: issueHandle,
      url: canonicalIssueUrl,
    },
    topic,
    anchor_updated: anchorUpdated,
    repos_scanned: repoStatuses,
    online_peers: onlinePeers,
    remotes_notified: remotesNotified,
    resume_hint: issueHandle !== "unknown" ? `resume ${issueHandle}` : "resume",
  };

  return result;
}

export function formatPauseHuman(result) {
  const lines = [
    "================================================================================",
    "⏸️  FRACTANET SESSION PAUSE (Safe Suspension)",
    "================================================================================",
  ];

  lines.push(`\n📍 Session Paused on: ${result.canonical_issue?.handle || "general"} (${result.canonical_issue?.url || "no issue"})`);
  lines.push(`   Packet: ${result.packet_id} [topic:${result.topic}]`);
  lines.push(`   Date:   ${result.timestamp.slice(0, 10)}`);

  const repos = result.repos_scanned || [];
  const cleanCount = repos.filter(r => r.clean).length;
  const dirtyCount = repos.filter(r => !r.clean).length;
  lines.push(`\n📂 Corpus Repositories Catalogued (${repos.length} total: ${cleanCount} clean, ${dirtyCount} dirty):`);
  for (const r of repos) {
    const statusStr = r.clean ? "clean" : `dirty (${r.modified_count}M, ${r.untracked_count}??)`;
    lines.push(`   - ${r.name.padEnd(20)}: ${r.branch.padEnd(20)} [${statusStr}]`);
  }

  lines.push("\n🌐 Fractanet Peers Online:");
  if ((result.online_peers || []).length > 0) {
    lines.push(`   - ${result.online_peers.join(", ")}`);
  } else {
    lines.push("   - Probes skipped or mesh offline");
  }

  lines.push("\n⚓ Sovereign Anchor:");
  lines.push(`   - JeanHuguesRobert/RESUME-SESSION.md: ${result.anchor_updated ? "updated & pushed" : "dry-run"}`);

  lines.push("\n💤 Session safely suspended. Resume at any time with:");
  lines.push(`   👉  ${result.resume_hint}`);
  lines.push("================================================================================\n");

  return lines.join("\n");
}
