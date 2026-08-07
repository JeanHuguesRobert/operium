/**
 * Observe developer tools vs Operium tools profile (OP-BUG-004).
 * No secret values. PATH/provider drift only.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandHome } from "./paths.js";

const operiumRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

export function defaultToolsProfilePath() {
  return path.join(operiumRoot, "profiles", "tools.workstation-windows.v1.yaml");
}

/**
 * Minimal YAML subset reader for our tools profiles (no full YAML dependency).
 * Expects the informal v0.1 shape used in profiles/tools.*.yaml.
 */
export function parseToolsProfile(text) {
  const lines = String(text).split(/\r?\n/);
  const profile = {
    profile_id: null,
    policy: {},
    tools: [],
  };
  let currentTool = null;
  let inDesired = false;
  let inPolicy = false;

  for (const raw of lines) {
    const line = raw.replace(/\t/g, "  ");
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const toolStart = line.match(/^  - id:\s*(.+)\s*$/);
    if (toolStart) {
      currentTool = { id: unquote(toolStart[1]), desired: {} };
      profile.tools.push(currentTool);
      inDesired = false;
      inPolicy = false;
      continue;
    }

    if (line.match(/^policy:\s*$/)) {
      inPolicy = true;
      currentTool = null;
      inDesired = false;
      continue;
    }

    if (currentTool && line.match(/^    desired:\s*$/)) {
      inDesired = true;
      continue;
    }

    if (currentTool && inDesired && line.match(/^    [a-z_]+:/)) {
      // left desired block (forbidden, notes, etc.)
      inDesired = false;
    }

    const top = line.match(/^([a-z_]+):\s*(.+)\s*$/);
    if (top && !line.startsWith(" ")) {
      if (top[1] === "profile_id") profile.profile_id = unquote(top[2]);
      continue;
    }

    if (inPolicy && !currentTool) {
      const pol = line.match(/^  ([a-z_]+):\s*(.+)\s*$/);
      if (pol) profile.policy[pol[1]] = unquote(pol[2]);
    }

    if (currentTool && !inDesired) {
      const field = line.match(/^    (status|priority|observed_path|observed_version|purpose):\s*(.+)\s*$/);
      if (field) currentTool[field[1]] = unquote(field[2]);
    }

    if (currentTool && inDesired) {
      const d = line.match(/^      ([a-z_]+):\s*(.+)\s*$/);
      if (d) currentTool.desired[d[1]] = unquote(d[2]);
    }
  }

  return profile;
}

function unquote(value) {
  let v = String(value).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  // strip inline comments for simple scalars
  const hash = v.indexOf(" #");
  if (hash >= 0) v = v.slice(0, hash).trim();
  return v;
}

export function isAdminNpmPath(p) {
  const n = String(p || "").toLowerCase().replace(/\//g, "\\");
  return n.includes("\\program files\\nodejs");
}

export function isUserSpacePath(p, home = os.homedir()) {
  const n = String(p || "").toLowerCase().replace(/\//g, "\\");
  const h = String(home).toLowerCase().replace(/\//g, "\\");
  if (!n) return false;
  if (n.startsWith(h)) return true;
  if (n.includes("\\.npm-global\\")) return true;
  if (n.includes("\\scoop\\")) return true;
  if (n.includes("\\.local\\")) return true;
  return false;
}

/**
 * Resolve command path on this host (Windows-aware).
 */
export function resolveCommand(command, env = process.env) {
  if (!command) return null;
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `(Get-Command -Name ${JSON.stringify(command)} -ErrorAction SilentlyContinue | Select-Object -First 1).Source`,
      ],
      { encoding: "utf8", env, timeout: 15000 }
    );
    const source = (result.stdout || "").trim();
    return source || null;
  }
  const result = spawnSync("sh", ["-c", `command -v ${command}`], {
    encoding: "utf8",
    env,
    timeout: 10000,
  });
  const source = (result.stdout || "").trim();
  return source || null;
}

export function readNpmPrefix(env = process.env) {
  const result = spawnSync("npm", ["config", "get", "prefix"], {
    encoding: "utf8",
    env,
    timeout: 20000,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) return null;
  return (result.stdout || "").trim() || null;
}

/**
 * @param {object} options
 * @param {string} [options.profilePath]
 * @param {string[]} [options.only] tool ids
 * @param {(cmd: string) => string|null} [options.resolve]
 * @param {() => string|null} [options.npmPrefix]
 */
export function auditTools(options = {}) {
  const profilePath = path.resolve(
    options.profilePath || defaultToolsProfilePath()
  );
  const text = fs.readFileSync(profilePath, "utf8");
  const profile = parseToolsProfile(text);
  const resolve = options.resolve || ((cmd) => resolveCommand(cmd));
  const npmPrefix =
    typeof options.npmPrefix === "function"
      ? options.npmPrefix()
      : readNpmPrefix();

  const tools = profile.tools.filter((t) => {
    if (!options.only?.length) return true;
    return options.only.includes(t.id);
  });

  /** Node runtime + package managers under Program Files are allowed; npm -g CLIs are not. */
  const coreNodeCommands = new Set(["node", "npm", "npx", "pnpm", "corepack"]);

  const observations = tools.map((tool) => {
    const cmd = tool.desired?.path_command || null;
    const resolved = cmd ? resolve(cmd) : null;
    const adminPath = resolved ? isAdminNpmPath(resolved) : false;
    const userSpace = resolved ? isUserSpacePath(resolved) : false;
    const coreNode = cmd ? coreNodeCommands.has(String(cmd).toLowerCase()) : false;
    let verdict = "unknown";
    if (!cmd) verdict = "no_path_command";
    else if (!resolved) verdict = "missing";
    else if (
      adminPath &&
      !coreNode &&
      profile.policy.forbid_admin_npm_global === "true"
    ) {
      // e.g. netlify/claude shims under Program Files\nodejs from admin npm -g
      verdict = "admin_path_debt";
    } else if (userSpace) verdict = "ok_user_space";
    else verdict = "ok_system"; // gh MSI, Program Files Git, system Node runtime

    return {
      id: tool.id,
      command: cmd,
      resolved,
      verdict,
      admin_npm_path: adminPath,
      user_space: userSpace,
      profile_status: tool.status || null,
      desired_provider: tool.desired?.provider || null,
    };
  });

  const adminDebt = observations.filter((o) => o.verdict === "admin_path_debt");
  const missing = observations.filter((o) => o.verdict === "missing");
  const npmPrefixAdmin = npmPrefix ? isAdminNpmPath(npmPrefix) : null;
  const npmPrefixUser = npmPrefix ? isUserSpacePath(npmPrefix) : null;

  /** OP-BUG-004 gate: user npm prefix + no admin-npm CLI debt on priority ≤2 required tools. */
  const blockingAdminDebt = adminDebt.filter((o) => {
    const tool = tools.find((t) => t.id === o.id);
    const prio = Number(tool?.priority ?? 99);
    return prio <= 2;
  });
  const blockingMissing = missing.filter((o) => {
    const tool = tools.find((t) => t.id === o.id);
    if (!tool) return false;
    if (isOptionalTool(tool)) return false;
    return Number(tool.priority ?? 99) === 1;
  });

  const ok =
    !npmPrefixAdmin &&
    blockingAdminDebt.length === 0 &&
    blockingMissing.length === 0;

  return {
    schema: "operium.tools-audit.v1",
    profile_id: profile.profile_id,
    profile_path: profilePath,
    policy: profile.policy,
    npm_prefix: npmPrefix,
    npm_prefix_admin: npmPrefixAdmin,
    npm_prefix_user_space: npmPrefixUser,
    ok,
    summary: {
      tools: observations.length,
      admin_path_debt: adminDebt.length,
      blocking_admin_path_debt: blockingAdminDebt.length,
      missing: missing.length,
      blocking_missing: blockingMissing.length,
      ok_user_space: observations.filter((o) => o.verdict === "ok_user_space")
        .length,
    },
    tools: observations,
    next_actions: buildNextActions({
      npmPrefixAdmin,
      npmPrefix,
      adminDebt: blockingAdminDebt,
      missing: blockingMissing,
      residualAdminDebt: adminDebt.filter((o) => !blockingAdminDebt.includes(o)),
      residualMissing: missing.filter((o) => !blockingMissing.includes(o)),
    }),
  };
}

function isOptionalTool(tool) {
  const status = String(tool.status || "").toLowerCase();
  const provider = String(tool.desired?.provider || "").toLowerCase();
  if (status === "absent") return true;
  if (provider === "optional") return true;
  if (status === "present_path_registration_pending") return true;
  if (Number(tool.priority ?? 99) >= 3) return true;
  return false;
}

function buildNextActions({
  npmPrefixAdmin,
  npmPrefix,
  adminDebt,
  missing,
  residualAdminDebt = [],
  residualMissing = [],
}) {
  const actions = [];
  if (npmPrefixAdmin) {
    actions.push(
      `Set user npm prefix: pwsh -File scripts/ops/ensure-user-npm-prefix.ps1 (current: ${npmPrefix})`
    );
  }
  for (const item of adminDebt) {
    actions.push(
      `Prefer user-space install for ${item.id} (resolved admin path: ${item.resolved}); ensure scoop/user PATH precedes Program Files\\nodejs`
    );
  }
  for (const item of missing) {
    actions.push(`Install or PATH-fix missing tool: ${item.id} (${item.command})`);
  }
  for (const item of residualMissing) {
    actions.push(
      `(non-blocking) optional/absent missing: ${item.id} (${item.command || "n/a"})`
    );
  }
  for (const item of residualAdminDebt) {
    actions.push(
      `(non-blocking) admin path residual: ${item.id} @ ${item.resolved}`
    );
  }
  if (!actions.length) {
    actions.push("No blocking tooling drift on audited priority surface.");
  }
  return actions;
}

export function expandProfileHome(p) {
  return expandHome(p);
}
