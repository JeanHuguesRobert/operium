#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadRegistry } from "../lib/registry.js";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import { recoverOna } from "../lib/ona-recovery.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-ona-recovery-"));
const registryPath = path.join(tmpDir, "resources.yaml");
const dbPath = path.join(tmpDir, "node_memory.sqlite");
fs.writeFileSync(registryPath, `nodes:
  - hostname: fracta
    recovery_observer:
      targets: [poco-jhr]
      cooldown_ms: 900000
  - hostname: poco-jhr
    operium_node_agent:
      port: 8794
      recovery:
        ssh_command: "restart-ona"
        wait_ms: 0
`, "utf8");

const { db, migration } = openNodeMemoryDb({ dbPath, seedLocalState: false, backfillCopEvents: false });
assert.ok(migration.applied.includes(6));
let healthChecks = 0;
const fetch = async () => ({ ok: healthChecks++ >= 1 });
const calls = [];
const execFileAsync = async (...args) => { calls.push(args); };
const now = new Date("2026-09-01T00:00:00.000Z");

const recovered = await recoverOna({ host: "poco-jhr", registryPath, db, fetch, execFileAsync, delay: async () => {}, now });
assert.equal(recovered.outcome, "recovered");
assert.equal(recovered.attempted, true);
assert.equal(calls.length, 2);
assert.equal(calls[0][1].at(-1), "true");
assert.ok(recovered.cooldown_until);

const cooling = await recoverOna({ host: "poco-jhr", registryPath, db, fetch: async () => ({ ok: false }), execFileAsync, now: new Date("2026-09-01T00:01:00.000Z") });
assert.equal(cooling.outcome, "cooldown_active");
assert.equal(cooling.attempted, false);
assert.equal(calls.length, 2);

const receipts = db.prepare("SELECT outcome FROM ona_recovery_receipts WHERE hostname = ? ORDER BY observed_at").all("poco-jhr");
assert.deepEqual(receipts.map(row => row.outcome), ["recovered", "cooldown_active"]);
db.close();
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, tests: ["durable_cooldown", "ssh_gate", "audit_receipts"] }));
