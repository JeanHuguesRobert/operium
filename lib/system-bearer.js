/**
 * System bearer (COGENTIA_API_KEY) apply / verify procedure.
 * SoT → optional vault → known runtime copies → planned consumer restarts.
 * Values are never included in reports.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fingerprintValue,
  readKeyFromFile,
  syncKeyToFile,
} from "./env-key-file.js";
import { expandHome } from "./paths.js";

const operiumRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

export const SYSTEM_BEARER_KEY = "COGENTIA_API_KEY";
export const VAULT_KEY = "cogentia_api_key";

export function defaultSotPath(env = process.env) {
  const configured = expandHome(env.OPERIUM_SECRET_SOT || env.INSEME_ENV || "");
  if (configured) return path.resolve(configured);
  return path.resolve(operiumRoot, "..", "inseme", ".env");
}

export function defaultGatewayEnvPath(env = process.env) {
  const configured = expandHome(env.OPERIUM_AGENT_GATEWAY_ENV || "");
  if (configured) return path.resolve(configured);
  return path.join(os.homedir(), ".cogentia", "secrets", "agent-gateway.env");
}

export function defaultVaultScriptPath(env = process.env) {
  const configured = expandHome(env.OPERIUM_SYNC_SECRETS_SCRIPT || "");
  if (configured) return path.resolve(configured);
  return path.resolve(
    operiumRoot,
    "..",
    "inseme",
    "apps",
    "platform",
    "scripts",
    "sync-secrets.js"
  );
}

/**
 * Build a machine-readable plan and optionally apply local copy + vault.
 *
 * @param {object} options
 * @param {boolean} [options.apply=false]
 * @param {boolean} [options.vault=false]  require apply; runs inseme sync-secrets
 * @param {boolean} [options.restart=false] only plans restart unless runner supplied
 * @param {string} [options.sot]
 * @param {string} [options.gatewayEnv]
 * @param {string} [options.key]
 * @param {string} [options.fractaHost] if set, plan remote magistral copy refresh
 * @param {string} [options.magistralEnv] remote path default /etc/cogentia/magistral.env
 * @param {(cmd: string[], opts) => {status:number, stdout:string, stderr:string}} [options.run]
 */
export function runSystemBearerProcedure(options = {}) {
  const apply = Boolean(options.apply);
  const wantVault = Boolean(options.vault);
  const wantRestart = Boolean(options.restart);
  const key = options.key || SYSTEM_BEARER_KEY;
  const sotPath = path.resolve(options.sot || defaultSotPath());
  const gatewayPath = path.resolve(
    options.gatewayEnv || defaultGatewayEnvPath()
  );
  const vaultScript = path.resolve(
    options.vaultScript || defaultVaultScriptPath()
  );
  const fractaHost = options.fractaHost || null;
  const magistralEnv =
    options.magistralEnv || "/etc/cogentia/magistral.env";
  const run = options.run || defaultRun;

  const steps = [];
  let ok = true;
  let blocked = false;

  const sot = readKeyFromFile(sotPath, key);
  const sotFp = fingerprintValue(sot.value);
  steps.push({
    id: "sot",
    role: "authority",
    path: sot.path,
    present: sot.present && !sot.empty,
    fingerprint: sotFp ? sotFp.slice(0, 12) : null,
  });

  if (!sot.present || sot.empty) {
    ok = false;
    blocked = true;
    return finalize({
      ok,
      blocked,
      apply,
      key,
      steps,
      error: "sot_key_missing",
      message: `Source of truth missing ${key} at ${sot.path}`,
      next_actions: [
        `Set ${key}=… in ${sot.path} (workstation FS authority)`,
        "Re-run: node scripts/ops/apply-system-bearer.js",
      ],
    });
  }

  // Local gateway runtime copy
  const gatewayBefore = readKeyFromFile(gatewayPath, key);
  const gatewayMatch =
    gatewayBefore.present &&
    !gatewayBefore.empty &&
    gatewayBefore.value === sot.value;
  steps.push({
    id: "gateway_copy",
    role: "runtime_copy",
    path: gatewayPath,
    present: gatewayBefore.present && !gatewayBefore.empty,
    match: gatewayMatch,
    action: apply
      ? gatewayMatch
        ? "noop"
        : "write"
      : gatewayMatch
        ? "ok"
        : "would_write",
  });

  if (apply && !gatewayMatch) {
    const result = syncKeyToFile(sot.value, gatewayPath, key, { dryRun: false });
    steps[steps.length - 1].changed = result.changed;
    steps[steps.length - 1].match = true;
  } else if (!apply && !gatewayMatch) {
    ok = false;
  }

  // Vault (edge authority) — optional, never prints secrets
  const vaultStep = {
    id: "vault",
    role: "edge_authority",
    vault_key: VAULT_KEY,
    script: vaultScript,
    script_present: fs.existsSync(vaultScript),
    requested: wantVault,
  };

  if (wantVault) {
    if (!apply) {
      vaultStep.action = "blocked_needs_apply";
      vaultStep.note =
        "Vault writes require --apply --vault (double opt-in).";
      ok = false;
    } else if (!vaultStep.script_present) {
      vaultStep.action = "skipped_missing_script";
      vaultStep.note = "inseme sync-secrets.js not found";
      ok = false;
    } else {
      const vaultRun = run(
        [process.execPath, vaultScript, "--apply", "--vault"],
        {
          cwd: path.dirname(vaultScript),
          env: process.env,
        }
      );
      vaultStep.action = "ran";
      vaultStep.exit_code = vaultRun.status;
      vaultStep.ok = vaultRun.status === 0;
      // Do not forward stdout (may contain key names + drift hints)
      vaultStep.stderr_present = Boolean(vaultRun.stderr?.trim());
      if (vaultRun.status !== 0) {
        ok = false;
        vaultStep.error = "vault_sync_failed";
      }
    }
  } else {
    vaultStep.action = "planned";
    vaultStep.command =
      "cd inseme/apps/platform && node scripts/sync-secrets.js --apply --vault";
    vaultStep.note =
      "Not run (pass --vault with --apply). Edge may still hold previous bearer.";
  }
  steps.push(vaultStep);

  // Remote magistral copy (plan only unless custom runner injects apply)
  if (fractaHost) {
    const remoteStep = {
      id: "magistral_copy",
      role: "runtime_copy",
      host: fractaHost,
      path: magistralEnv,
      action: apply ? "planned_ssh" : "would_ssh",
      command: [
        "ssh",
        fractaHost,
        `test -f ${shellQuote(magistralEnv)} && grep -q '^${key}=' ${shellQuote(magistralEnv)}`,
      ].join(" "),
      note: apply
        ? "Remote write not auto-executed from this host tool; use publish-inseme-env-to-fracta.ps1 or ssh + sync-env-key after SoT is on fracta authority."
        : "Dry-run: verify remote file contains key after publish.",
      publish_helper:
        "pwsh -File scripts/ops/publish-inseme-env-to-fracta.ps1",
    };
    steps.push(remoteStep);
  } else {
    steps.push({
      id: "magistral_copy",
      role: "runtime_copy",
      host: "fracta",
      path: magistralEnv,
      action: "planned",
      note: "Pass --fracta-host fracta to include remote verify plan.",
      publish_helper:
        "pwsh -File scripts/ops/publish-inseme-env-to-fracta.ps1",
    });
  }

  // Consumer restarts — never implicit without --restart
  const restarts = [
    {
      id: "restart_agent_gateway",
      host: "thinkpad",
      action: wantRestart && apply ? "planned" : "planned",
      command:
        "Restart CogentiaAgentGateway scheduled task or ONA-owned gateway process",
      required: !gatewayMatch || apply,
    },
    {
      id: "restart_magistral",
      host: "fracta",
      action: "planned",
      command: "sudo systemctl restart magistral",
      required: Boolean(fractaHost),
    },
  ];
  steps.push({
    id: "restarts",
    role: "consumers",
    requested: wantRestart,
    items: restarts,
    note: wantRestart
      ? "Restart flags recorded; execute host-native restart after copies match."
      : "Pass --restart to mark restarts as required after apply.",
  });

  // Smoke plan (no network by default)
  steps.push({
    id: "smoke",
    role: "verify",
    action: "planned",
    checks: [
      "GET gateway /health?quick=1 with Authorization: Bearer <new> → 200",
      "fracta ONA gateway probe ok (Bearer aligned)",
      "Guide conversational path no 401 on coding-agent hop",
    ],
  });

  const gatewayAfter = readKeyFromFile(gatewayPath, key);
  const localAligned =
    gatewayAfter.present &&
    !gatewayAfter.empty &&
    gatewayAfter.value === sot.value;

  return finalize({
    ok: ok && (apply ? localAligned : localAligned),
    blocked: false,
    apply,
    key,
    sot: { path: sot.path, fingerprint: sotFp.slice(0, 12) },
    local_gateway_aligned: localAligned,
    steps,
    next_actions: buildNextActions({
      apply,
      wantVault,
      localAligned,
      gatewayPath,
      sotPath,
      fractaHost,
    }),
  });
}

function buildNextActions({
  apply,
  wantVault,
  localAligned,
  gatewayPath,
  sotPath,
  fractaHost,
}) {
  const actions = [];
  if (!localAligned) {
    actions.push(
      `Apply local copy: node scripts/ops/apply-system-bearer.js --apply (writes ${gatewayPath} from ${sotPath})`
    );
  }
  if (!wantVault) {
    actions.push(
      "Push edge vault when edge must match: --apply --vault"
    );
  }
  actions.push(
    "Publish FS authority to fracta if needed: pwsh -File scripts/ops/publish-inseme-env-to-fracta.ps1"
  );
  actions.push(
    "Refresh magistral EnvironmentFile / restart: ssh fracta 'sudo systemctl restart magistral'"
  );
  actions.push(
    "Restart ThinkPad Agent CLI Gateway after local copy change"
  );
  actions.push(
    "Smoke: Bearer health on gateway + Guide conversational path"
  );
  if (fractaHost) {
    actions.push(`Remote host planned: ${fractaHost}`);
  }
  if (apply && localAligned) {
    actions.unshift("Local gateway env copy aligned with SoT.");
  }
  return actions;
}

function finalize(report) {
  return {
    schema: "operium.system-bearer-apply.v1",
    ok: report.ok,
    blocked: Boolean(report.blocked),
    apply: Boolean(report.apply),
    key: report.key,
    value_disclosed: false,
    sot: report.sot || null,
    local_gateway_aligned: Boolean(report.local_gateway_aligned),
    error: report.error || null,
    message: report.message || null,
    steps: report.steps,
    next_actions: report.next_actions || [],
  };
}

function defaultRun(argv, opts = {}) {
  const result = spawnSync(argv[0], argv.slice(1), {
    encoding: "utf8",
    cwd: opts.cwd,
    env: opts.env || process.env,
  });
  return {
    status: result.status == null ? 1 : result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
