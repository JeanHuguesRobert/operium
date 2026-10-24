#!/usr/bin/env node
import assert from "node:assert/strict";
import { pingCogentia, getCogentiaSemanticContext, formatCogentiaStatus } from "../lib/cogentia-bridge.js";

async function main() {
  const ping = await pingCogentia({ timeoutMs: 300 });

  assert.ok(ping, "ping returned object");
  assert.ok(["daemon", "filesystem", "none"].includes(ping.mode), "valid mode");
  assert.ok(ping.available === true, "cogentia is available either via daemon or filesystem");

  const context = await getCogentiaSemanticContext({ issueHandle: "operium/52" });
  assert.equal(context.schema, "operium.cogentia_bridge.v1");
  assert.ok(context.ok, "context ok");
  assert.ok(context.semantics, "semantics present");

  const formatted = formatCogentiaStatus(context);
  assert.ok(typeof formatted === "string" && formatted.length > 0, "formatted string not empty");

  console.log(JSON.stringify({
    ok: true,
    test: "cogentiaBridge",
    mode: ping.mode,
    status_summary: formatted,
    repo_count: ping.repo_count,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
