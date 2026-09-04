/**
 * operium/lib/next-session.js
 *
 * Implements the "next?" (deliberation) and "next" (execution) protocols:
 * - next? : Derives a prioritized list of logical next actions based on FBF doctrine,
 *           workspace state, active issue, and mesh health.
 * - next  : Executes the top-priority logical action automatically.
 */

import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { statusSession } from "./status-session.js";
import { checkpointSession } from "./checkpoint-session.js";
import { runGit } from "./git-wip.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPERIUM_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(OPERIUM_ROOT, "..");

export async function planNextSteps(options = {}) {
  const status = await statusSession(options);

  const steps = [];

  // 1. FixBugsFirst Rule (Strict Priority P0)
  if (status.fbf_gate?.blocked) {
    steps.push({
      priority: "P0 (Bloquant)",
      recommended: true,
      id: "fbf_fix_bugs",
      type: "fbf_blocker",
      title: `Résoudre les bugs bloquants dans le sous-système '${status.fbf_gate.subsystem}'`,
      command: `operium backlog list --subsystem ${status.fbf_gate.subsystem}`,
      reason: "La doctrine FixBugsFirst interdit formellement de poursuivre des fonctionnalités tant que des bugs critiques ou hauts sont ouverts.",
      impact: "Débloque le gate du sous-système et autorise la reprise du développement.",
    });
  }

  // 2. Unpushed Commits / Mesh Sync Rule
  const operiumWs = status.workspaces.find(w => w.name === "operium");
  if (operiumWs && operiumWs.ahead > 0) {
    steps.push({
      priority: steps.length === 0 ? "P1 (Recommandé)" : "P1",
      recommended: steps.length === 0,
      id: "push_and_sync_mesh",
      type: "mesh_sync",
      title: "Pousser les commits locaux vers origin et synchroniser le mesh Fractanet",
      command: "git push origin wip/mail-dns-cutover",
      reason: `${operiumWs.ahead} commit(s) locaux ne sont pas encore poussés sur origin et propagés aux nœuds fracta / rpi3-view.`,
      impact: "Garantit la réplication temps réel et prévient les dérives de branches.",
    });
  }

  // 3. Tests on dirty worktree Rule
  const hasDirty = status.workspaces.some(w => !w.clean);
  if (hasDirty) {
    steps.push({
      priority: steps.length === 0 ? "P1 (Recommandé)" : "P2",
      recommended: steps.length === 0,
      id: "run_test_suite",
      type: "test",
      title: "Valider l'ensemble des tests du gestionnaire de session",
      command: "npm run test:checkpoint; npm run test:status",
      reason: "Des modifications non committées existent dans l'espace de travail ; les tests doivent être verts avant consolidation.",
      impact: "Vérifie l'intégrité du code avant tout commit ou checkpoint.",
    });
  }

  // 4. In-flight Consolidation Checkpoint Rule
  steps.push({
    priority: steps.length === 0 ? "P1 (Recommandé)" : "P2",
    recommended: steps.length === 0,
    id: "checkpoint_session",
    type: "checkpoint",
    title: "Consolider la session courante via un checkpoint souverain",
    command: "operium checkpoint",
    reason: "Scelle l'état courant dans RESUME-SESSION.md, vérifie l'absence de fuites et notifie le mesh.",
    impact: "Garantit une ré-entrée sans perte même en cas d'interruption abrupte.",
  });

  // 5. Active Issue Road-map Rule
  const issueHandle = status.session?.canonical_issue?.handle;
  if (issueHandle) {
    steps.push({
      priority: "P3 (Suite)",
      recommended: false,
      id: "advance_issue",
      type: "feature",
      title: `Poursuivre la feuille de route de l'issue active (${issueHandle})`,
      command: `gh issue view ${status.session.canonical_issue.number} --repo ${status.session.canonical_issue.owner}/${status.session.canonical_issue.repo}`,
      reason: "Dérouler les prochaines tâches prévues dans l'issue GitHub de cadrage.",
      impact: "Progresse vers la clôture de l'issue.",
    });
  }

  return {
    schema: "operium.next_plan.v1",
    ok: true,
    timestamp: new Date().toISOString(),
    status,
    steps,
    top_step: steps.find(s => s.recommended) || steps[0],
  };
}

export async function executeNextStep(options = {}) {
  const plan = await planNextSteps(options);
  const step = plan.top_step;

  if (!step) {
    return {
      schema: "operium.next_exec.v1",
      ok: false,
      error: "no_next_step_available",
    };
  }

  if (options.dryRun) {
    return {
      schema: "operium.next_exec.v1",
      ok: true,
      dry_run: true,
      step,
      output: `[dry-run] Serait exécuté : ${step.command}`,
    };
  }

  let execOutput = "";
  let success = true;

  try {
    if (step.type === "checkpoint") {
      const cpRes = await checkpointSession({ ...options, cli: false });
      success = cpRes.ok;
      execOutput = `Checkpoint scellé avec le paquet ${cpRes.packet_id} (ancre mise à jour: ${cpRes.anchor_updated})`;
    } else if (step.type === "mesh_sync") {
      const gitRes = await runGit(["push", "origin", "wip/mail-dns-cutover"], { cwd: OPERIUM_ROOT, allowFailure: true });
      success = gitRes.ok;
      execOutput = gitRes.stdout || gitRes.stderr || "Git push exécuté.";
    } else if (step.type === "test") {
      const { stdout, stderr } = await execFileAsync("node", ["scripts/test-operium-checkpoint.js"], { cwd: OPERIUM_ROOT });
      execOutput = stdout || stderr;
    } else {
      execOutput = `Action prête : ${step.title}\nCommande recommandée : ${step.command}`;
    }
  } catch (err) {
    success = false;
    execOutput = err.message;
  }

  return {
    schema: "operium.next_exec.v1",
    ok: success,
    timestamp: new Date().toISOString(),
    step,
    output: execOutput,
  };
}

export function formatNextHuman(result, mode = "plan") {
  const lines = [];

  if (mode === "exec") {
    lines.push("================================================================================");
    lines.push("⚡ EXÉCUTION DE L'ÉTAPE SUIVANTE (next)");
    lines.push("================================================================================");
    lines.push("");
    const s = result.step || {};
    lines.push(`🎯 Action exécutée : ${s.title}`);
    lines.push(`   ↳ Commande : ${s.command}`);
    lines.push(`   ↳ Priorité : ${s.priority}`);
    lines.push("");
    lines.push("📝 Résultat de l'exécution :");
    lines.push(result.output ? result.output.trim() : "(Aucune sortie)");
    lines.push("");
    lines.push(result.ok ? "✅ Étape réalisée avec succès !" : "❌ L'étape a rencontré une erreur.");
    lines.push("👉 Pour consolider l'état courant : tapez 'operium checkpoint' (ou 'cp').");
    lines.push("================================================================================");
    return lines.join("\n");
  }

  // Plan / Deliberation mode (next?)
  lines.push("================================================================================");
  lines.push("🧭 DÉLIBÉRATION : PROCHAINES ÉTAPES LOGIQUES (next?)");
  lines.push("================================================================================");
  lines.push("");
  const st = result.status?.session || {};
  lines.push(`📍 Contexte Actif : ${st.canonical_issue?.handle || "non défini"} · Topic : ${st.topic_id || "continuation"}`);
  lines.push(`   Doctrine FBF   : ${result.status?.fbf_gate?.blocked ? "⛔ BLOQUÉ" : "✅ VERT (aucune obstruction)"}`);
  lines.push("");

  (result.steps || []).forEach((step, idx) => {
    const isTop = step.recommended;
    const prefix = isTop ? "👉 Option 1 (Recommandée)" : `   Option ${idx + 1}`;
    lines.push(`${prefix} : ${step.title}`);
    lines.push(`   ↳ Priorité : ${step.priority}`);
    lines.push(`   ↳ Pourquoi : ${step.reason}`);
    lines.push(`   ↳ Commande : ${step.command}`);
    lines.push("");
  });

  lines.push("================================================================================");
  lines.push("💡 Pour exécuter l'action recommandée #1 : tapez 'operium next' (ou dans le chat 'next').");
  lines.push("================================================================================");
  lines.push("");

  return lines.join("\n");
}
