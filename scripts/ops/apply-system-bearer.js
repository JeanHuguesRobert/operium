#!/usr/bin/env node
/**
 * OP-BUG-002 — single entry point for system bearer (COGENTIA_API_KEY) hygiene.
 *
 * Dry-run by default. Never prints secret values.
 *
 * Usage:
 *   node scripts/ops/apply-system-bearer.js
 *   node scripts/ops/apply-system-bearer.js --apply
 *   node scripts/ops/apply-system-bearer.js --apply --vault
 *   node scripts/ops/apply-system-bearer.js --fracta-host fracta
 *   node scripts/ops/apply-system-bearer.js --human
 */

import process from "node:process";
import {
  defaultGatewayEnvPath,
  defaultSotPath,
  runSystemBearerProcedure,
} from "../../lib/system-bearer.js";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`apply-system-bearer — SoT → vault → runtime copies (OP-BUG-002)

Usage:
  node scripts/ops/apply-system-bearer.js [options]

Options:
  (default)              Dry-run: verify SoT + local gateway copy alignment
  --apply                Write local agent-gateway.env from SoT
  --vault                With --apply: also run inseme sync-secrets --apply --vault
  --restart              Mark consumer restarts as required in the report
  --fracta-host <name>   Include remote magistral copy plan (default SSH host name)
  --sot <path>           Workstation FS authority (default ../inseme/.env)
  --gateway-env <path>   Runtime copy (default ~/.cogentia/secrets/agent-gateway.env)
  --key <NAME>           Default COGENTIA_API_KEY
  --human                Human summary (default is JSON)
  --json                 JSON report (default)
  -h, --help             Show help

Safety:
  - Secret values are never printed (value_disclosed: false).
  - Vault requires double opt-in: --apply --vault.
  - Remote magistral write is planned, not silently executed over SSH.
`);
  process.exit(0);
}

const report = runSystemBearerProcedure({
  apply: Boolean(args.apply),
  vault: Boolean(args.vault),
  restart: Boolean(args.restart),
  sot: args.sot || defaultSotPath(),
  gatewayEnv: args["gateway-env"] || defaultGatewayEnvPath(),
  key: args.key,
  fractaHost: args["fracta-host"] || null,
});

if (args.human) {
  printHuman(report);
} else {
  console.log(JSON.stringify(report, null, 2));
}

process.exit(report.ok ? 0 : 1);

function printHuman(report) {
  const mode = report.apply ? "APPLY" : "DRY-RUN";
  console.log(`system-bearer ${mode} · key=${report.key} · ok=${report.ok}`);
  if (report.sot) {
    console.log(`  SoT: ${report.sot.path} (fp ${report.sot.fingerprint}…)`);
  }
  console.log(
    `  local gateway aligned: ${report.local_gateway_aligned ? "yes" : "NO"}`
  );
  for (const step of report.steps) {
    if (step.id === "restarts" || step.id === "smoke") continue;
    const bits = [step.id, step.action || "", step.match === false ? "DRIFT" : ""]
      .filter(Boolean)
      .join(" · ");
    console.log(`  - ${bits}`);
  }
  if (report.next_actions?.length) {
    console.log("next:");
    for (const action of report.next_actions) {
      console.log(`  · ${action}`);
    }
  }
}

function parseArgs(argv) {
  const out = { help: false, apply: false, vault: false, restart: false, human: false, json: true };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    switch (item) {
      case "-h":
      case "--help":
        out.help = true;
        break;
      case "--apply":
        out.apply = true;
        break;
      case "--vault":
        out.vault = true;
        break;
      case "--restart":
        out.restart = true;
        break;
      case "--human":
        out.human = true;
        out.json = false;
        break;
      case "--json":
        out.json = true;
        out.human = false;
        break;
      case "--sot":
      case "--gateway-env":
      case "--key":
      case "--fracta-host":
        out[item.slice(2)] = argv[i + 1];
        i += 1;
        break;
      default:
        console.error(`unknown option: ${item}`);
        process.exit(2);
    }
  }
  return out;
}
