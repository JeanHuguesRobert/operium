#!/usr/bin/env node
/**
 * Audit workstation tools vs Operium profile (OP-BUG-004).
 *
 *   node scripts/ops/audit-tools.js
 *   node scripts/ops/audit-tools.js --human
 *   node scripts/ops/audit-tools.js --only supabase-cli,netlify-cli,gh
 */

import process from "node:process";
import {
  auditTools,
  defaultToolsProfilePath,
} from "../../lib/tools-audit.js";

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`audit-tools — observe tools vs Operium profile

Usage:
  node scripts/ops/audit-tools.js [--human] [--only id1,id2]
  node scripts/ops/audit-tools.js --profile path/to/tools.yaml

Exit 0 when npm prefix is user-space and no priority-1 tools are missing /
admin-npm-path debt for forbidden globals. Exit 1 on drift.
`);
  process.exit(0);
}

const report = auditTools({
  profilePath: args.profile || defaultToolsProfilePath(),
  only: args.only,
});

if (args.human) {
  printHuman(report);
} else {
  console.log(JSON.stringify(report, null, 2));
}

process.exit(report.ok ? 0 : 1);

function printHuman(report) {
  console.log(
    `tools-audit · profile=${report.profile_id} · ok=${report.ok}`
  );
  console.log(
    `  npm prefix: ${report.npm_prefix || "(unknown)"} · user=${report.npm_prefix_user_space} admin=${report.npm_prefix_admin}`
  );
  console.log(
    `  summary: ${report.summary.tools} tools · admin_debt=${report.summary.admin_path_debt} · missing=${report.summary.missing}`
  );
  for (const tool of report.tools) {
    const mark =
      tool.verdict === "ok_user_space" || tool.verdict === "ok_system"
        ? "ok"
        : tool.verdict;
    console.log(
      `  - ${tool.id}: ${mark}${tool.resolved ? ` @ ${tool.resolved}` : ""}`
    );
  }
  if (report.next_actions?.length) {
    console.log("next:");
    for (const a of report.next_actions) console.log(`  · ${a}`);
  }
}

function parseArgs(argv) {
  const out = { help: false, human: false, only: null, profile: null };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "-h" || item === "--help") out.help = true;
    else if (item === "--human") out.human = true;
    else if (item === "--json") out.human = false;
    else if (item === "--profile") {
      out.profile = argv[i + 1];
      i += 1;
    } else if (item === "--only") {
      out.only = String(argv[i + 1] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      i += 1;
    } else {
      console.error(`unknown option: ${item}`);
      process.exit(2);
    }
  }
  return out;
}
