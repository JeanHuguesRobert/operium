#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "ops", "termux-tmux-handoff.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "operium-tmux-handoff-"));
const payload = path.join(tmp, "handoff.txt");
fs.writeFileSync(payload, "Read CPKT-2026-006 before acting.\n", "utf8");

try {
  const run = spawnSync(process.execPath, [script, "send", "--session", "fbf-dashboard", "--file", payload, "--i-am-present", "--dry-run"], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const body = JSON.parse(run.stdout);
  assert.equal(body.ok, true);
  assert.equal(body.dry_run, true);
  assert.match(body.payload_sha256, /^[a-f0-9]{64}$/);

  const bad = spawnSync(process.execPath, [script, "status", "--session", "bad;command", "--dry-run"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /simple named tmux session/);

  console.log(JSON.stringify({ ok: true, tests: ["send-dry-run", "session-validation"] }, null, 2));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
