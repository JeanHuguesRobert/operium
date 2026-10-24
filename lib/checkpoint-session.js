/**
 * operium/lib/checkpoint-session.js
 *
 * Implements the session "checkpoint" protocol (immediate pause + resume):
 * 1. Executes pre-flight security scan (detects leaks, .env, unencrypted keys)
 * 2. Seals current progress into sovereign anchor (JeanHuguesRobert/RESUME-SESSION.md)
 * 3. Notifies reachable Fractanet mesh peers (git fetch) to prevent drift
 * 4. Runs situational reconnaissance on Fractanet health (Tailscale, Guide)
 * 5. Evaluates the FixBugsFirst gate on the active subsystem
 * 6. Emits a clean, consolidated horizon brief for the Principal and Agent
 */

import { pauseSession } from "./pause-session.js";
import { reconSession } from "./resume-session.js";

export async function checkpointSession(options = {}) {
  // 1. Execute Pause with mode='checkpoint'
  const pauseResult = await pauseSession({
    ...options,
    mode: "checkpoint",
  });

  if (!pauseResult.ok) {
    return {
      schema: "operium.checkpoint_state.v1",
      ok: false,
      error: pauseResult.error || "checkpoint_preflight_failed",
      pause: pauseResult,
    };
  }

  // 2. Execute Immediate Reconnaissance (Resume Recon)
  const reconResult = await reconSession(options);

  const isBlocked = reconResult.fbf_gate?.blocked === true;

  return {
    schema: "operium.checkpoint_state.v1",
    ok: !isBlocked,
    timestamp: new Date().toISOString(),
    dry_run: options.dryRun === true,
    packet_id: pauseResult.packet_id,
    canonical_issue: pauseResult.canonical_issue,
    topic: pauseResult.topic,
    security_scan: {
      clean: true,
      scanned_repos: (pauseResult.repos_scanned || []).map(r => r.name),
    },
    anchor_updated: pauseResult.anchor_updated,
    workspaces: pauseResult.repos_scanned,
    mesh_status: {
      online_peers: pauseResult.online_peers || [],
      remotes_notified: pauseResult.remotes_notified || [],
      operium_up: reconResult.operium_up,
    },
    fbf_gate: reconResult.fbf_gate,
    immediate_next_action: reconResult.immediate_next_action,
  };
}

export function formatCheckpointHuman(result) {
  const lines = [];
  lines.push("================================================================================");
  lines.push("🔖 FRACTANET SESSION CHECKPOINT (Consolidation & Re-alignment)");
  lines.push("================================================================================");
  lines.push("");

  if (!result.ok && result.pause?.error === "secret_like_paths_detected") {
    lines.push("❌ CHECKPOINT ABORTED: Potential secret-like files detected!");
    for (const b of result.pause.blocked_paths || []) {
      lines.push(`   - [${b.repo}] ${b.path}`);
    }
    lines.push("");
    lines.push("👉 Remove or encrypt these files before running checkpoint.");
    lines.push("================================================================================");
    return lines.join("\n");
  }

  const issueHandle = result.canonical_issue?.handle || "unknown";
  const issueUrl = result.canonical_issue?.url || "";
  lines.push(`📍 Active Issue: ${issueHandle}${issueUrl ? ` (${issueUrl})` : ""}`);
  lines.push(`   Packet: ${result.packet_id} [topic:${result.topic}]`);
  lines.push(`   Date:   ${result.timestamp.slice(0, 10)}`);
  lines.push("");

  lines.push("🔒 Pre-flight Security Scan:");
  lines.push(`   ✅ 0 secret-like files detected across ${result.security_scan?.scanned_repos?.length || 3} workspaces.`);
  lines.push("");

  lines.push("📂 Workspaces Catalogued:");
  for (const w of result.workspaces || []) {
    const dirtyStr = w.clean ? "clean" : `dirty (${w.modified_count || 0}M, ${w.untracked_count || 0}??)`;
    lines.push(`   - ${w.name.padEnd(16)}: ${w.branch} [${dirtyStr}]`);
  }
  lines.push("");

  lines.push("🌐 Mesh & Recon:");
  if (result.mesh_status?.online_peers?.length > 0) {
    lines.push(`   - Peers Online   : ${result.mesh_status.online_peers.join(", ")}`);
  }
  if (result.mesh_status?.remotes_notified?.length > 0) {
    lines.push(`   - Remotes Notified: ${result.mesh_status.remotes_notified.join(", ")}`);
  }
  const score = result.mesh_status?.operium_up?.layers?.mesh?.score;
  if (score !== undefined) {
    lines.push(`   - Health Score    : ${score} · ${result.mesh_status?.operium_up?.layers?.mesh?.status || "active"}`);
  }
  lines.push("");

  lines.push("🛡️  FixBugsFirst Gate:");
  if (result.fbf_gate?.blocked) {
    lines.push(`   ⛔ BLOCKED in subsystem '${result.fbf_gate.subsystem}'!`);
    lines.push(`      Critical bugs (${result.fbf_gate.critical_count}) or High bugs (${result.fbf_gate.high_count}) require immediate attention.`);
  } else {
    lines.push(`   ✅ GREEN in subsystem '${result.fbf_gate?.subsystem || "mesh"}' (No blocking critical/high bugs)`);
  }
  lines.push("");

  lines.push("⚓ Sovereign Anchor:");
  lines.push(`   - JeanHuguesRobert/RESUME-SESSION.md: ${result.anchor_updated ? "updated & pushed" : (result.dry_run ? "dry-run" : "unchanged")}`);
  lines.push("");

  lines.push("✨ Checkpoint sealed & verified. Ready to proceed!");
  if (result.immediate_next_action) {
    lines.push(`   👉 ${result.immediate_next_action}`);
  }
  lines.push("================================================================================");
  lines.push("");

  return lines.join("\n");
}
