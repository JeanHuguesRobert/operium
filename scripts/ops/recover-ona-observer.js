#!/usr/bin/env node
import { recoverOna } from "../../lib/ona-recovery.js";
import { fileURLToPath } from "node:url";

export async function runScheduledHeartbeat(options = {}) {
  const targets = Array.isArray(options.args) ? options.args : [];
  const results = [];
  for (const host of targets) {
    try {
      results.push(await recoverOna({ host, env: options.env, fetch: options.fetch }));
    } catch (error) {
      results.push({ ok: error.message === "recover_ona_not_configured", host, outcome: "not_configured", error: error.message });
    }
  }
  return {
    ok: results.every(result => result.ok || result.outcome === "restart_unverified"),
    schema: "operium.ona-recovery-observer.v1",
    observed_at: new Date().toISOString(),
    results,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await runScheduledHeartbeat({ args: process.argv.slice(2), env: process.env });
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}
