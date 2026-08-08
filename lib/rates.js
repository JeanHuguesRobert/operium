/**
 * Operium Model Rates Operational Helper
 *
 * Exposes operium rates update command to sync live model pricing from providers
 * into packages/cop-core/src/model-rates.json.
 *
 * @module operium/lib/rates
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const operiumRoot = path.resolve(__dirname, "..");
const insemeScript = path.resolve(operiumRoot, "..", "inseme", "scripts", "ops", "update-model-rates.js");

/**
 * Execute model rate card update.
 *
 * @param {object} options
 * @param {boolean} [options.human=false]
 * @returns {object} Result object with status and model counts
 */
export async function runRatesUpdate(options = {}) {
  if (!fs.existsSync(insemeScript)) {
    return {
      ok: false,
      error: "script_not_found",
      message: `Fetcher script missing: ${insemeScript}`,
    };
  }

  const args = [insemeScript];
  if (options.human) args.push("--human");

  const r = spawnSync(process.execPath, args, {
    encoding: "utf8",
    timeout: 60000,
    env: process.env,
  });

  if (r.status !== 0) {
    return {
      ok: false,
      error: "rates_update_failed",
      stderr: r.stderr,
      stdout: r.stdout,
    };
  }

  if (options.human) {
    return { ok: true, output: r.stdout };
  }

  try {
    const json = JSON.parse(r.stdout);
    return { ok: true, ...json };
  } catch {
    return { ok: true, output: r.stdout };
  }
}
