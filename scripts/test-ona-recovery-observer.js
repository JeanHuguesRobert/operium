#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runScheduledJob } from "../lib/node-agent/job-runner.js";
import { runScheduledHeartbeat } from "../scripts/ops/recover-ona-observer.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-ona-observer-"));
const registryPath = path.join(tmpDir, "resources.yaml");
fs.writeFileSync(registryPath, "nodes:\n  - hostname: rpi3-view\n    operium_node_agent:\n      port: 8794\n", "utf8");

const result = await runScheduledHeartbeat({
  args: ["rpi3-view"],
  env: { OPERIUM_REGISTRY: registryPath },
});
assert.equal(result.ok, true);
assert.equal(result.results[0].outcome, "not_configured");

const fromScheduler = await runScheduledJob({
  kind: "script",
  config: {
    script: "operium/scripts/ops/recover-ona-observer.js",
    args: ["rpi3-view"],
  },
}, { env: { OPERIUM_REGISTRY: registryPath } });
assert.equal(fromScheduler.ok, true);
assert.equal(fromScheduler.results[0].outcome, "not_configured");
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, tests: ["in_process_observer", "scheduler_args", "no_process_exit"] }));
