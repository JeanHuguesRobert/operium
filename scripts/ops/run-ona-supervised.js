#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const agentEntry = path.join(repoRoot, "bin", "operium-node-agent.js");
const restartDelayMs = boundedDelay(process.env.ONA_RESTART_DELAY_MS);
let stopping = false;
let child = null;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    if (child && !child.killed) child.kill(signal);
  });
}

while (!stopping) {
  child = spawn(process.execPath, [agentEntry], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  const outcome = await waitForExit(child);
  child = null;

  if (stopping || outcome.code === 0) {
    process.exitCode = outcome.code ?? 0;
    break;
  }

  console.error(JSON.stringify({
    ok: false,
    event: "ona.supervisor.restart",
    exit_code: outcome.code,
    signal: outcome.signal,
    requested: outcome.code === 75,
    delay_ms: restartDelayMs,
  }));
  await delay(restartDelayMs);
}

function waitForExit(processHandle) {
  return new Promise((resolve, reject) => {
    processHandle.once("error", reject);
    processHandle.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

function boundedDelay(value) {
  const parsed = Number(value || 2000);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 250), 30000) : 2000;
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
