#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["bin/operium.js", "up", "--no-probe", "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  timeout: 15_000,
});

assert.equal(result.error, undefined, result.error?.message);
assert.equal(result.signal, null, `unexpected signal: ${result.signal}`);
assert.notEqual(result.status, null, result.stderr || result.stdout);
assert.doesNotMatch(result.stderr, /UV_HANDLE_CLOSING/);
assert.equal(JSON.parse(result.stdout).schema, "operium.up.v1");

console.log(JSON.stringify({ ok: true, tests: ["up_no_probe_exits_cleanly"] }, null, 2));
