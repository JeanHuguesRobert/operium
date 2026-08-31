#!/usr/bin/env node
import { recoverOna } from "../../lib/ona-recovery.js";

const targets = process.argv.slice(2);
const results = [];
for (const host of targets) {
  try {
    results.push(await recoverOna({ host }));
  } catch (error) {
    results.push({ ok: error.message === "recover_ona_not_configured", host, outcome: "not_configured", error: error.message });
  }
}
console.log(JSON.stringify({ schema: "operium.ona-recovery-observer.v1", observed_at: new Date().toISOString(), results }));
process.exit(results.some(result => !result.ok && result.outcome !== "restart_unverified") ? 1 : 0);
