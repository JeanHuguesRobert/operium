#!/usr/bin/env node
import assert from "node:assert/strict";
import { planNextSteps, executeNextStep, formatNextHuman } from "../lib/next-session.js";

async function main() {
  // 1. Test next? (deliberation / plan)
  const plan = await planNextSteps({ timeoutMs: 1500, probe: false });

  assert.equal(plan.schema, "operium.next_plan.v1");
  assert.ok(plan.ok, "plan ok");
  assert.ok(Array.isArray(plan.steps), "steps is array");
  assert.ok(plan.steps.length > 0, "at least one step proposed");
  assert.ok(plan.top_step, "top_step present");

  const humanPlan = formatNextHuman(plan, "plan");
  assert.ok(humanPlan.includes("PROCHAINES ÉTAPES LOGIQUES"), "contains plan header");
  assert.ok(humanPlan.includes("Option 1 (Recommandée)"), "contains option 1");

  // 2. Test next (execution dry-run)
  const execDry = await executeNextStep({ dryRun: true, timeoutMs: 1500, probe: false });
  assert.equal(execDry.schema, "operium.next_exec.v1");
  assert.ok(execDry.ok, "exec ok");
  assert.equal(execDry.dry_run, true);
  assert.ok(execDry.step, "step present in exec result");

  const humanExec = formatNextHuman(execDry, "exec");
  assert.ok(humanExec.includes("EXÉCUTION DE L'ÉTAPE SUIVANTE"), "contains exec header");

  console.log(JSON.stringify({
    ok: true,
    test: "nextSession",
    total_steps: plan.steps.length,
    top_step: plan.top_step.title,
    top_priority: plan.top_step.priority,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
