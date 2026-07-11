import { pathToFileURL } from "node:url";
import { spawnHeadless } from "../spawn-headless.js";
import { runOnaHeartbeat } from "./heartbeat.js";
import { loadEnvFiles } from "./job-env.js";
import { resolveJobCwd, resolveScriptPath } from "./job-registry.js";

export async function runScheduledJob(job, options = {}) {
  const config = options.config;
  const baseEnv = options.env || config?.env || process.env;
  const timeoutMs = Number(options.timeoutMs || config?.jobTimeoutMs || 120_000);
  const jobConfig = job.config || {};

  const env = loadEnvFiles(jobConfig.env_files || [], baseEnv);

  if (job.kind === "ona.heartbeat") {
    return runOnaHeartbeat({
      env,
      fetch: options.fetch,
      hostname: config?.hostname,
      registryPath: config?.registryPath,
      withdraw: options.withdraw,
    });
  }

  if (job.kind === "script") {
    return runScriptJob(job, { env, config, timeoutMs, spawnImpl: options.spawnImpl, fetch: options.fetch });
  }

  return { ok: false, exitCode: 1, error: "unknown_job_kind", kind: job.kind };
}

async function runScriptJob(job, options) {
  const scriptPath = resolveScriptPath(job.config?.script, options.env);
  if (!scriptPath) {
    return {
      ok: false,
      exitCode: 1,
      error: "script_not_found",
      script: job.config?.script || null,
    };
  }

  const inProcess = await tryRunScriptInProcess(scriptPath, options);
  if (inProcess) return inProcess;

  if (process.platform === "win32") {
    return {
      ok: false,
      exitCode: 1,
      error: "windows_in_process_required",
      script: scriptPath,
      detail: "export runScheduledHeartbeat() — child node.exe flashes console from LocalSystem service",
    };
  }

  return runScriptJobSpawned(job, scriptPath, options);
}

async function tryRunScriptInProcess(scriptPath, options) {
  let mod;
  try {
    mod = await import(pathToFileURL(scriptPath).href);
  } catch {
    return null;
  }
  if (typeof mod.runScheduledHeartbeat !== "function") {
    return null;
  }
  try {
    return await mod.runScheduledHeartbeat({
      env: options.env,
      fetch: options.fetch,
    });
  } catch (error) {
    return {
      ok: false,
      exitCode: 1,
      error: error.message || "in_process_script_failed",
      script: scriptPath,
    };
  }
}

function runScriptJobSpawned(job, scriptPath, options) {
  const cwd = resolveJobCwd(job.config?.cwd, options.env);
  const spawnImpl = options.spawnImpl || spawnHeadless;
  const timeoutMs = options.timeoutMs;
  const captureOutput = process.platform !== "win32";

  return new Promise((resolve) => {
    const child = spawnImpl(process.execPath, [scriptPath], {
      cwd: cwd || undefined,
      env: options.env,
    });

    let stdout = "";
    let stderr = "";
    if (captureOutput) {
      child.stdout?.on("data", chunk => { stdout += chunk; });
      child.stderr?.on("data", chunk => { stderr += chunk; });
    }

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({
        ok: false,
        exitCode: 1,
        error: "job_timeout",
        script: scriptPath,
        detail: trimTail(stderr || stdout),
      });
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: 1,
        error: error.message || "spawn_failed",
        script: scriptPath,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const ok = code === 0;
      resolve({
        ok,
        exitCode: code ?? 1,
        error: ok ? null : "script_exit_nonzero",
        script: scriptPath,
        detail: ok ? trimTail(stdout) : trimTail(stderr || stdout),
      });
    });
  });
}

function trimTail(text, max = 400) {
  const clean = String(text || "").trim();
  if (clean.length <= max) return clean;
  return clean.slice(-max);
}