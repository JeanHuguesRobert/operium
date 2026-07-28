#!/usr/bin/env node
/**
 * claude-mode — Operium-owned Claude Code backend switch
 *
 * Modes:
 *   pro     Clear API/proxy overrides → use claude.ai OAuth (Pro subscription)
 *   zai     Point Claude Code at z.ai Anthropic-compatible API (ZAI_API_KEY)
 *   status  Show mode + auth (no secrets)
 *   doctor  status + lightweight probes (OAuth / z.ai balance)
 *
 * Ownership: Operium (operational desired-state). Values never committed.
 * Local convenience wrappers live in the workstation workspace (C:/tweesic).
 *
 * Usage:
 *   node operium/scripts/ops/claude-mode.js <pro|zai|status|doctor> [--json] [--dry-run]
 *
 * Env:
 *   CLAUDE_HOME          default ~/.claude
 *   INSEME_ENV_PATH      path to inseme/.env (for ZAI_API_KEY)
 *   ZAI_API_KEY          overrides file lookup when setting zai mode
 *   TWEESIC_ROOT         default C:/tweesic (Windows) or sibling of operium
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPERIUM_ROOT = path.resolve(__dirname, "..", "..");

const ZAI_BASE_URL = "https://api.z.ai/api/anthropic";
const ANTHROPIC_API = "https://api.anthropic.com";

const MODE_MARKER = "operium_claude_mode";

function usage(exitCode = 1) {
  const text = `claude-mode — switch Claude Code backend (Operium)

Usage:
  node claude-mode.js pro [--dry-run] [--json]
  node claude-mode.js zai [--dry-run] [--json]
  node claude-mode.js status [--json]
  node claude-mode.js doctor [--json]

Modes:
  pro     Use claude.ai OAuth (Pro). Removes ANTHROPIC_AUTH_TOKEN / BASE_URL overrides.
  zai     Use z.ai GLM proxy. Writes ZAI_API_KEY + BASE_URL into ~/.claude/settings.json
  status  Report active mode and auth (no secret values)
  doctor  status + probe OAuth / z.ai (classifies balance / expired)

After pro|zai: restart Claude Code for the session to pick up settings.
`;
  process.stdout.write(text);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = new Set();
  const positionals = [];
  for (const a of args) {
    if (a === "-h" || a === "--help") flags.add("help");
    else if (a === "--json") flags.add("json");
    else if (a === "--dry-run") flags.add("dry-run");
    else if (a.startsWith("-")) {
      process.stderr.write(`Unknown flag: ${a}\n`);
      usage(2);
    } else positionals.push(a);
  }
  return {
    cmd: (positionals[0] || "").toLowerCase(),
    json: flags.has("json"),
    dryRun: flags.has("dry-run"),
    help: flags.has("help"),
  };
}

function homeClaudeDir() {
  if (process.env.CLAUDE_HOME) return path.resolve(process.env.CLAUDE_HOME);
  return path.join(os.homedir(), ".claude");
}

function tweesicRoot() {
  if (process.env.TWEESIC_ROOT) return path.resolve(process.env.TWEESIC_ROOT);
  // operium is usually C:/tweesic/operium
  const parent = path.resolve(OPERIUM_ROOT, "..");
  if (fs.existsSync(path.join(parent, "inseme"))) return parent;
  if (process.platform === "win32" && fs.existsSync("C:\\tweesic\\inseme")) {
    return "C:\\tweesic";
  }
  return parent;
}

function candidateEnvPaths() {
  const list = [];
  if (process.env.INSEME_ENV_PATH) list.push(process.env.INSEME_ENV_PATH);
  list.push(path.join(tweesicRoot(), "inseme", ".env"));
  list.push(path.join(tweesicRoot(), "inseme", "apps", "platform", ".env"));
  // Linux nodes sometimes keep a shared secrets dir
  list.push(path.join(os.homedir(), "tweesic", "inseme", ".env"));
  list.push("/srv/cogentia/secrets/inseme.env");
  return list;
}

/** Minimal KEY=VALUE parser (no export, no multiline). */
function parseDotEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const text = fs.readFileSync(filePath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function resolveZaiKey() {
  if (process.env.ZAI_API_KEY && process.env.ZAI_API_KEY.trim()) {
    return { key: process.env.ZAI_API_KEY.trim(), source: "env:ZAI_API_KEY" };
  }
  for (const p of candidateEnvPaths()) {
    const env = parseDotEnv(p);
    if (env.ZAI_API_KEY && env.ZAI_API_KEY.trim()) {
      return { key: env.ZAI_API_KEY.trim(), source: p };
    }
  }
  return { key: null, source: null };
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, filePath);
}

function mask(s, keep = 6) {
  if (!s) return null;
  const str = String(s);
  if (str.length <= keep) return `len=${str.length}`;
  return `${str.slice(0, keep)}…(len=${str.length})`;
}

function detectMode(settings) {
  const env = settings?.env || {};
  const base = env.ANTHROPIC_BASE_URL || "";
  const token = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || "";
  const marked = settings?.[MODE_MARKER] || settings?.operium?.claude_mode;

  if (marked === "pro" || marked === "zai" || marked === "api") {
    // Trust marker if consistent; else re-detect
    if (marked === "zai" && /z\.ai/i.test(base)) return "zai";
    if (marked === "pro" && !token && !base) return "pro";
    if (marked === "api" && token && !/z\.ai/i.test(base)) return "api";
  }

  if (/z\.ai/i.test(base) || (token && !base && looksLikeZaiKey(token))) {
    return "zai";
  }
  if (token && !base) return "api"; // console key path
  if (!token && !base) return "pro";
  if (base && !/z\.ai/i.test(base)) return "custom";
  return "unknown";
}

function looksLikeZaiKey(token) {
  // z.ai keys often look like uuid.segment — not sk-ant-
  return Boolean(token) && !String(token).startsWith("sk-ant-");
}

function readOAuth() {
  const credPath = path.join(homeClaudeDir(), ".credentials.json");
  const cred = readJsonSafe(credPath);
  const oauth = cred?.claudeAiOauth;
  if (!oauth) {
    return {
      present: false,
      path: credPath,
      subscriptionType: null,
      expired: null,
      expiresAt: null,
      hasRefresh: false,
      tokenPrefix: null,
    };
  }
  const expMs = oauth.expiresAt != null ? Number(oauth.expiresAt) : null;
  const expired =
    expMs != null && Number.isFinite(expMs) ? Date.now() > expMs : null;
  return {
    present: true,
    path: credPath,
    subscriptionType: oauth.subscriptionType || null,
    rateLimitTier: oauth.rateLimitTier || null,
    scopes: oauth.scopes || null,
    expired,
    expiresAt:
      expMs != null && Number.isFinite(expMs)
        ? new Date(expMs).toISOString()
        : null,
    hasRefresh: Boolean(oauth.refreshToken && String(oauth.refreshToken).length),
    tokenPrefix: mask(oauth.accessToken, 12),
    accessToken: oauth.accessToken || null, // only used by doctor; never printed
  };
}

function buildStatus() {
  const claudeDir = homeClaudeDir();
  const settingsPath = path.join(claudeDir, "settings.json");
  const settings = readJsonSafe(settingsPath) || {};
  const env = settings.env || {};
  const mode = detectMode(settings);
  const oauth = readOAuth();
  // strip token from oauth public view
  const oauthPublic = { ...oauth };
  delete oauthPublic.accessToken;

  const processOverride = {
    ANTHROPIC_AUTH_TOKEN: Boolean(process.env.ANTHROPIC_AUTH_TOKEN),
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || null,
  };

  return {
    ok: true,
    tool: "claude-mode",
    owner: "operium",
    mode,
    settingsPath,
    claudeDir,
    baseUrl: env.ANTHROPIC_BASE_URL || null,
    hasEnvToken: Boolean(env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY),
    envTokenPrefix: mask(env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY, 8),
    processOverride,
    oauth: oauthPublic,
    restartRequiredHint:
      mode === "pro" || mode === "zai"
        ? "Restart Claude Code after mode changes"
        : null,
    observedAt: new Date().toISOString(),
  };
}

function applyPro({ dryRun }) {
  const settingsPath = path.join(homeClaudeDir(), "settings.json");
  const prev = readJsonSafe(settingsPath) || {};
  const next = {
    ...prev,
    env: { ...(prev.env || {}) },
    [MODE_MARKER]: "pro",
  };
  delete next.env.ANTHROPIC_AUTH_TOKEN;
  delete next.env.ANTHROPIC_API_KEY;
  delete next.env.ANTHROPIC_BASE_URL;
  // keep timeouts / traffic flags if present; set sensible defaults if empty env
  if (next.env.API_TIMEOUT_MS == null) next.env.API_TIMEOUT_MS = "3000000";
  if (next.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC == null) {
    next.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = 1;
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      action: "pro",
      wouldWrite: settingsPath,
      mode: "pro",
      note: "Would clear ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL",
    };
  }

  writeJson(settingsPath, next);
  return {
    ok: true,
    action: "pro",
    mode: "pro",
    settingsPath,
    message:
      "Switched to pro (claude.ai OAuth). No API/proxy overrides in settings.json.",
    nextSteps: [
      "If OAuth expired: run `claude auth login`",
      "Restart Claude Code",
      "Verify: node claude-mode.js doctor",
    ],
  };
}

function applyZai({ dryRun }) {
  const { key, source } = resolveZaiKey();
  if (!key) {
    return {
      ok: false,
      action: "zai",
      error: "ZAI_API_KEY not found",
      lookedIn: candidateEnvPaths(),
      hint: "Set ZAI_API_KEY in inseme/.env (workstation SoT) or export ZAI_API_KEY",
    };
  }

  const settingsPath = path.join(homeClaudeDir(), "settings.json");
  const prev = readJsonSafe(settingsPath) || {};
  const next = {
    ...prev,
    env: {
      ...(prev.env || {}),
      ANTHROPIC_AUTH_TOKEN: key,
      ANTHROPIC_BASE_URL: ZAI_BASE_URL,
      API_TIMEOUT_MS: (prev.env && prev.env.API_TIMEOUT_MS) || "3000000",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:
        (prev.env && prev.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC) ?? 1,
    },
    [MODE_MARKER]: "zai",
  };

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      action: "zai",
      wouldWrite: settingsPath,
      mode: "zai",
      keySource: source,
      keyPrefix: mask(key, 8),
      baseUrl: ZAI_BASE_URL,
    };
  }

  writeJson(settingsPath, next);
  return {
    ok: true,
    action: "zai",
    mode: "zai",
    settingsPath,
    keySource: source,
    keyPrefix: mask(key, 8),
    baseUrl: ZAI_BASE_URL,
    message: "Switched to z.ai (GLM via Anthropic-compatible proxy).",
    nextSteps: [
      "Restart Claude Code",
      "Verify: node claude-mode.js doctor",
      "If 1113 balance errors: recharge z.ai resource package",
    ],
  };
}

async function fetchJson(url, options, timeoutMs = 25000) {
  // Prefer AbortSignal.timeout when available; avoid Windows libuv abort races.
  const signal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
  const res = await fetch(url, { ...options, ...(signal ? { signal } : {}) });
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, body };
}

async function doctor() {
  const status = buildStatus();
  const probes = {};

  // OAuth probe (only if token present)
  const oauthFull = readOAuth();
  if (oauthFull.present && oauthFull.accessToken) {
    try {
      const r = await fetchJson(`${ANTHROPIC_API}/v1/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${oauthFull.accessToken}`,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "oauth-2025-04-20",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 8,
          messages: [{ role: "user", content: "Reply with exactly OK" }],
        }),
      });
      const errType = r.body?.error?.type || r.body?.type;
      const errMsg = r.body?.error?.message || r.body?.message || "";
      let classification = "unknown";
      if (r.status >= 200 && r.status < 300) classification = "ok";
      else if (/expired/i.test(errMsg)) classification = "oauth_expired";
      else if (r.status === 401) classification = "oauth_auth_error";
      else if (r.status === 429) classification = "rate_limit";
      probes.oauth = {
        endpoint: `${ANTHROPIC_API}/v1/messages`,
        status: r.status,
        classification,
        errorType: errType || null,
        errorMessage: errMsg ? String(errMsg).slice(0, 200) : null,
      };
    } catch (e) {
      probes.oauth = {
        classification: "network_error",
        errorMessage: String(e.message || e).slice(0, 200),
      };
    }
  } else {
    probes.oauth = {
      classification: oauthFull.present ? "no_access_token" : "not_logged_in",
      hint: "Run: claude auth login",
    };
  }

  // z.ai probe (use key from env file or current settings if zai mode)
  let zaiKey = resolveZaiKey().key;
  if (!zaiKey && status.hasEnvToken && status.mode === "zai") {
    const settings = readJsonSafe(path.join(homeClaudeDir(), "settings.json"));
    zaiKey = settings?.env?.ANTHROPIC_AUTH_TOKEN || null;
  }
  if (zaiKey) {
    try {
      const r = await fetchJson(`${ZAI_BASE_URL}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": zaiKey,
          Authorization: `Bearer ${zaiKey}`,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "glm-4.7",
          max_tokens: 8,
          messages: [{ role: "user", content: "OK" }],
        }),
      });
      const errMsg = r.body?.error?.message || r.body?.msg || "";
      const errCode = r.body?.error?.code;
      let classification = "unknown";
      if (r.status >= 200 && r.status < 300 && !r.body?.error) {
        classification = "ok";
      } else if (
        r.status === 429 ||
        /1113|Insufficient balance|no resource package/i.test(String(errMsg))
      ) {
        classification = "zai_insufficient_balance";
      } else if (r.status === 401 || r.status === 403) {
        classification = "zai_auth_error";
      } else if (r.status === 429) {
        classification = "zai_rate_limit";
      }
      probes.zai = {
        endpoint: `${ZAI_BASE_URL}/v1/messages`,
        status: r.status,
        classification,
        errorCode: errCode ?? null,
        errorMessage: errMsg ? String(errMsg).slice(0, 200) : null,
      };
    } catch (e) {
      probes.zai = {
        classification: "network_error",
        errorMessage: String(e.message || e).slice(0, 200),
      };
    }
  } else {
    probes.zai = {
      classification: "no_key",
      hint: "Set ZAI_API_KEY in inseme/.env to enable zai mode / probe",
    };
  }

  // Recommendation
  let recommendation = null;
  if (status.mode === "zai" && probes.zai?.classification === "zai_insufficient_balance") {
    recommendation =
      "Active mode is zai but balance is empty → claude-mode pro + claude auth login, or recharge z.ai";
  } else if (
    status.mode === "pro" &&
    (probes.oauth?.classification === "oauth_expired" ||
      probes.oauth?.classification === "oauth_auth_error")
  ) {
    recommendation = "Pro mode but OAuth bad → run: claude auth login";
  } else if (status.mode === "pro" && probes.oauth?.classification === "ok") {
    recommendation = "Pro OAuth healthy";
  } else if (status.mode === "zai" && probes.zai?.classification === "ok") {
    recommendation = "z.ai healthy";
  }

  return {
    ...status,
    doctor: true,
    probes,
    recommendation,
  };
}

function printHuman(result) {
  if (result.action === "pro" || result.action === "zai") {
    if (!result.ok) {
      console.log(`✗ ${result.error || "failed"}`);
      if (result.hint) console.log(`  ${result.hint}`);
      if (result.lookedIn) {
        console.log("  Looked in:");
        for (const p of result.lookedIn) console.log(`    - ${p}`);
      }
      return;
    }
    if (result.dryRun) {
      console.log(`[dry-run] would set mode=${result.mode}`);
      console.log(`  file: ${result.wouldWrite}`);
      if (result.baseUrl) console.log(`  base: ${result.baseUrl}`);
      if (result.keySource) console.log(`  key:  ${result.keySource} (${result.keyPrefix})`);
      return;
    }
    console.log(`✓ ${result.message || `mode=${result.mode}`}`);
    console.log(`  settings: ${result.settingsPath}`);
    if (result.baseUrl) console.log(`  base:     ${result.baseUrl}`);
    if (result.keySource) console.log(`  key from: ${result.keySource}`);
    if (result.nextSteps?.length) {
      console.log("  next:");
      for (const s of result.nextSteps) console.log(`    - ${s}`);
    }
    return;
  }

  // status / doctor
  console.log("Claude Code mode (Operium)");
  console.log(`  mode:     ${result.mode}`);
  console.log(`  settings: ${result.settingsPath}`);
  console.log(`  baseUrl:  ${result.baseUrl || "(default api.anthropic.com)"}`);
  console.log(`  envToken: ${result.hasEnvToken ? result.envTokenPrefix : "(none)"}`);
  console.log("  oauth:");
  if (!result.oauth?.present) {
    console.log("    present: false  → claude auth login");
  } else {
    console.log(`    present:    true`);
    console.log(`    subscription: ${result.oauth.subscriptionType || "?"}`);
    console.log(`    expired:    ${result.oauth.expired}`);
    console.log(`    expiresAt:  ${result.oauth.expiresAt || "?"}`);
    console.log(`    refresh:    ${result.oauth.hasRefresh}`);
  }
  if (result.processOverride) {
    const po = result.processOverride;
    if (po.ANTHROPIC_AUTH_TOKEN || po.ANTHROPIC_API_KEY || po.ANTHROPIC_BASE_URL) {
      console.log("  process env overrides (may shadow settings):");
      if (po.ANTHROPIC_AUTH_TOKEN) console.log("    ANTHROPIC_AUTH_TOKEN=set");
      if (po.ANTHROPIC_API_KEY) console.log("    ANTHROPIC_API_KEY=set");
      if (po.ANTHROPIC_BASE_URL) console.log(`    ANTHROPIC_BASE_URL=${po.ANTHROPIC_BASE_URL}`);
    }
  }
  if (result.probes) {
    console.log("  probes:");
    for (const [name, p] of Object.entries(result.probes)) {
      console.log(`    ${name}: ${p.classification}${p.status != null ? ` (HTTP ${p.status})` : ""}`);
      if (p.errorMessage) console.log(`      ${p.errorMessage}`);
      if (p.hint) console.log(`      hint: ${p.hint}`);
    }
  }
  if (result.recommendation) {
    console.log(`  recommend: ${result.recommendation}`);
  }
}

async function main() {
  const { cmd, json, dryRun, help } = parseArgs(process.argv);
  if (help || !cmd) usage(help ? 0 : 1);

  let result;
  switch (cmd) {
    case "pro":
      result = applyPro({ dryRun });
      break;
    case "zai":
      result = applyZai({ dryRun });
      break;
    case "status":
      result = buildStatus();
      break;
    case "doctor":
      result = await doctor();
      break;
    default:
      process.stderr.write(`Unknown command: ${cmd}\n`);
      usage(2);
  }

  if (json) {
    // Never emit raw tokens
    const safe = JSON.parse(JSON.stringify(result, (k, v) => {
      if (k === "accessToken" || k === "key") return undefined;
      return v;
    }));
    process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`);
  } else {
    printHuman(result);
  }

  process.exit(result.ok === false ? 1 : 0);
}

main().catch((e) => {
  process.stderr.write(`${e.stack || e}\n`);
  process.exit(1);
});
