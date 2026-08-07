#!/usr/bin/env node
/**
 * Verify Magistral coding-agent map vs Operium profile (OP-FEAT-001 / issue #10).
 * Never prints secret values.
 *
 * Usage:
 *   node scripts/ops/verify-magistral-coding-map.js
 *   node scripts/ops/verify-magistral-coding-map.js --live /etc/cogentia/magistral-openai-map.json
 *   node scripts/ops/verify-magistral-coding-map.js --live map.json --human
 *   node scripts/ops/verify-magistral-coding-map.js --expect-profile profiles/magistral-map.coding-agents.v1.json
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultProfile = path.join(
  root,
  "profiles",
  "magistral-map.coding-agents.v1.json"
);

function loadMap(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error(`map must be a JSON array: ${filePath}`);
  }
  return data;
}

export function verifyMaps(profile, live, meta = {}) {
  const profileById = indexById(profile);
  const codingIds = profile
    .filter((n) => String(n.id || "").startsWith("coding-"))
    .map((n) => n.id);

  const checks = [];
  let ok = true;

  // Profile self-invariants (desired state)
  for (const id of codingIds) {
    const node = profileById.get(id);
    const tier = node?.tier;
    const pass = tier === "fast" || tier === "strong";
    checks.push({
      id: `profile.${id}.tier_primary`,
      ok: pass,
      expected: "fast|strong",
      actual: tier,
    });
    if (!pass) ok = false;
    const keyEnv = node?.apiKeyEnv;
    const keyOk = keyEnv === "COGENTIA_API_KEY";
    checks.push({
      id: `profile.${id}.apiKeyEnv`,
      ok: keyOk,
      expected: "COGENTIA_API_KEY",
      actual: keyEnv || null,
    });
    if (!keyOk) ok = false;
  }

  const openaiPrimary = profile.filter(
    (n) =>
      String(n.id || "").startsWith("openai-") &&
      (n.tier === "fast" || n.tier === "strong")
  );
  checks.push({
    id: "profile.openai_not_primary",
    ok: openaiPrimary.length === 0,
    expected: "openai-* only fallback (or absent)",
    actual: openaiPrimary.map((n) => `${n.id}:${n.tier}`),
  });
  if (openaiPrimary.length) ok = false;

  if (!live) {
    return finalize({
      ok,
      mode: "profile_only",
      profilePath: meta.profilePath || null,
      livePath: null,
      checks,
      summary: {
        coding_nodes: codingIds,
        live_compared: false,
      },
      next_actions: ok
        ? [
            "Apply on fracta: bash scripts/ops/apply-magistral-coding-map-fracta.sh",
            "Re-run with --live /etc/cogentia/magistral-openai-map.json",
          ]
        : ["Fix profiles/magistral-map.coding-agents.v1.json invariants"],
    });
  }

  const liveById = indexById(live);

  for (const id of codingIds) {
    const expected = profileById.get(id);
    const actual = liveById.get(id);
    const present = Boolean(actual);
    checks.push({
      id: `live.${id}.present`,
      ok: present,
      expected: "present",
      actual: present ? "present" : "missing",
    });
    if (!present) {
      ok = false;
      continue;
    }
    const tierOk = actual.tier === expected.tier;
    checks.push({
      id: `live.${id}.tier`,
      ok: tierOk,
      expected: expected.tier,
      actual: actual.tier,
    });
    if (!tierOk) ok = false;

    const modelOk = actual.model === expected.model;
    checks.push({
      id: `live.${id}.model`,
      ok: modelOk,
      expected: expected.model,
      actual: actual.model,
    });
    if (!modelOk) ok = false;

    // URL host/path shape (no secrets)
    const urlOk =
      typeof actual.url === "string" &&
      actual.url.includes("/v1/chat/completions");
    checks.push({
      id: `live.${id}.url_chat_completions`,
      ok: urlOk,
      expected: "…/v1/chat/completions",
      actual: redactUrl(actual.url),
    });
    if (!urlOk) ok = false;

    const envOk = actual.apiKeyEnv === "COGENTIA_API_KEY";
    checks.push({
      id: `live.${id}.apiKeyEnv`,
      ok: envOk,
      expected: "COGENTIA_API_KEY",
      actual: actual.apiKeyEnv || null,
    });
    if (!envOk) ok = false;
  }

  // OpenAI must not be preferred over coding agents when both exist
  const liveOpenAiFast = live.filter(
    (n) => String(n.id || "").startsWith("openai-") && n.tier === "fast"
  );
  const liveCodingFast = live.filter(
    (n) => String(n.id || "").startsWith("coding-") && n.tier === "fast"
  );
  const openaiDemoted =
    liveCodingFast.length > 0 ? liveOpenAiFast.length === 0 : true;
  checks.push({
    id: "live.openai_not_fast_when_coding_fast",
    ok: openaiDemoted,
    expected: "no openai-* at tier=fast while coding-* at fast",
    actual: {
      coding_fast: liveCodingFast.map((n) => n.id),
      openai_fast: liveOpenAiFast.map((n) => n.id),
    },
  });
  if (!openaiDemoted) ok = false;

  const next = [];
  if (!ok) {
    next.push(
      "On fracta: cd /srv/cogentia/repos/operium && git pull && bash scripts/ops/apply-magistral-coding-map-fracta.sh"
    );
    next.push("Ensure ThinkPad Agent CLI Gateway is running (health?quick=1)");
    next.push(
      "Confirm COGENTIA_API_KEY in /etc/cogentia/magistral.env matches gateway"
    );
  } else {
    next.push(
      "Smoke: POST https://cogentia.fractavolta.com/guide/chat expect mode=conversational when gateway healthy"
    );
    next.push("operium up --human (action / public_face sections)");
  }

  return finalize({
    ok,
    mode: "live_compare",
    profilePath: meta.profilePath || null,
    livePath: meta.livePath || null,
    checks,
    summary: {
      coding_nodes: codingIds,
      live_ids: live.map((n) => n.id),
      live_coding_fast: liveCodingFast.map((n) => n.id),
      live_openai_fast: liveOpenAiFast.map((n) => n.id),
      live_compared: true,
    },
    next_actions: next,
  });
}

function indexById(nodes) {
  const map = new Map();
  for (const n of nodes) {
    if (n && n.id) map.set(n.id, n);
  }
  return map;
}

function redactUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return "(invalid_url)";
  }
}

function finalize(report) {
  return {
    schema: "operium.magistral-map-verify.v1",
    ok: report.ok,
    mode: report.mode,
    profile_path: report.profilePath,
    live_path: report.livePath,
    summary: report.summary,
    checks: report.checks,
    failed: report.checks.filter((c) => !c.ok).map((c) => c.id),
    next_actions: report.next_actions,
    value_disclosed: false,
  };
}

function printHuman(report) {
  console.log(
    `magistral-map-verify · mode=${report.mode} · ok=${report.ok}`
  );
  if (report.failed?.length) {
    console.log(`  failed: ${report.failed.join(", ")}`);
  }
  for (const c of report.checks) {
    if (!c.ok) {
      console.log(`  ✗ ${c.id}: expected ${JSON.stringify(c.expected)} got ${JSON.stringify(c.actual)}`);
    }
  }
  if (report.ok) {
    console.log(
      `  coding_fast: ${(report.summary.live_coding_fast || report.summary.coding_nodes || []).join(", ")}`
    );
  }
  if (report.next_actions?.length) {
    console.log("next:");
    for (const a of report.next_actions) console.log(`  · ${a}`);
  }
}

function parseArgs(argv) {
  const out = { help: false, human: false, json: true };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "-h" || item === "--help") out.help = true;
    else if (item === "--human") out.human = true;
    else if (item === "--json") out.human = false;
    else if (item === "--live" || item === "--expect-profile") {
      out[item.slice(2)] = argv[i + 1];
      i += 1;
    } else {
      console.error(`unknown option: ${item}`);
      process.exit(2);
    }
  }
  return out;
}

export { loadMap };

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`verify-magistral-coding-map — OP-FEAT-001

Compare a live Magistral map JSON to the Operium profile template.

Options:
  --live <path>              Live map file (default: none; profile-only self-check)
  --expect-profile <path>    Template (default: profiles/magistral-map.coding-agents.v1.json)
  --human                    Human summary
  --json                     JSON report (default)
  -h, --help
`);
    process.exit(0);
  }

  const profilePath = path.resolve(args["expect-profile"] || defaultProfile);
  const profile = loadMap(profilePath);
  const livePath = args.live ? path.resolve(args.live) : null;
  const live = livePath ? loadMap(livePath) : null;

  const report = verifyMaps(profile, live, { profilePath, livePath });
  if (args.human) printHuman(report);
  else console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
