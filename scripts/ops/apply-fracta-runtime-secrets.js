#!/usr/bin/env node
/**
 * Fracta runtime secret hygiene — normal ops for provider/system keys.
 *
 * Projects selected keys from workstation SoT (inseme/.env) into Fracta
 * runtime copies (magistral.env, guide.env, jhn-mcp.env) without requiring
 * Supabase vault reads on the VPS.
 *
 * Dry-run by default. Never prints secret values.
 *
 * Usage:
 *   node scripts/ops/apply-fracta-runtime-secrets.js
 *   node scripts/ops/apply-fracta-runtime-secrets.js --human
 *   node scripts/ops/apply-fracta-runtime-secrets.js --apply --host fracta
 *   node scripts/ops/apply-fracta-runtime-secrets.js --apply --keys OPENAI_API_KEY
 */

import process from "node:process";
import {
  defaultSotPath,
  FRACTA_RUNTIME_KEY_CATALOG,
  runFractaRuntimeSecretsProcedure,
} from "../../lib/fracta-runtime-secrets.js";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`apply-fracta-runtime-secrets — SoT → Fracta runtime env copies

Usage:
  node scripts/ops/apply-fracta-runtime-secrets.js [options]

Options:
  (default)           Dry-run: fingerprint SoT vs remote files (exit 1 on drift)
  --apply             Write drifted keys on Fracta and restart consumers
  --no-restart        With --apply: write only (operator restarts later)
  --host <name>       SSH host (default: fracta)
  --sot <path>        Workstation authority (default: ../inseme/.env)
  --keys <A,B>        Subset of catalog keys (default: all catalog)
  --human             Human summary
  --json              JSON report (default)
  -h, --help

Catalog keys:
${FRACTA_RUNTIME_KEY_CATALOG.map((e) => `  - ${e.key}  (${e.note})`).join("\n")}

Safety:
  - Secret values never printed (value_disclosed: false).
  - Dry-run by default.
  - Remote writes use sudo over BatchMode SSH.
`);
  process.exit(0);
}

const keys = args.keys
  ? String(args.keys)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

const report = runFractaRuntimeSecretsProcedure({
  apply: Boolean(args.apply),
  restart: !args["no-restart"],
  host: args.host || "fracta",
  sot: args.sot || defaultSotPath(),
  keys,
});

if (args.human) {
  printHuman(report);
} else {
  console.log(JSON.stringify(report, null, 2));
}

process.exit(report.ok ? 0 : 1);

function printHuman(report) {
  const mode = report.apply ? "APPLY" : "DRY-RUN";
  console.log(
    `fracta-runtime-secrets ${mode} · host=${report.host} · ok=${report.ok}`
  );
  if (report.sot) {
    console.log(`  SoT: ${report.sot.path}`);
  }
  for (const step of report.steps || []) {
    if (step.id === "restarts" || step.id === "smoke") {
      console.log(
        `  ${step.id}: ${step.action}${
          step.services ? " " + step.services.join(",") : ""
        }${step.openai_models_http != null ? ` openai_http=${step.openai_models_http}` : ""}`
      );
      continue;
    }
    const drift = step.aligned === false ? " DRIFT" : "";
    console.log(`  ${step.id}: ${step.action || ""}${drift}`);
    for (const t of step.targets || []) {
      if (typeof t === "string") {
        console.log(`    ${t}`);
        continue;
      }
      console.log(
        `    ${t.path}: ${t.match ? "match" : t.present ? "stale" : "missing"}${
          t.fingerprint ? ` fp=${t.fingerprint}` : ""
        }`
      );
    }
  }
  if (report.next_actions?.length) {
    console.log("  next:");
    for (const a of report.next_actions) console.log(`    - ${a}`);
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "-h" || item === "--help") {
      out.help = true;
      continue;
    }
    if (!item.startsWith("--")) continue;
    const name = item.slice(2);
    if (
      name === "apply" ||
      name === "human" ||
      name === "json" ||
      name === "no-restart" ||
      name === "help"
    ) {
      out[name] = true;
      continue;
    }
    out[name] = argv[i + 1];
    i += 1;
  }
  return out;
}
