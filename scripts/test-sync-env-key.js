#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "operium-env-sync-"));
try {
  const source = path.join(tmp, "source.env");
  const target = path.join(tmp, "target.env");
  fs.writeFileSync(source, "SECRET=new-value\n");
  fs.writeFileSync(target, "KEEP=yes\r\nSECRET=old-value\r\nSECRET=duplicate\r\n");

  const result = spawnSync(process.execPath, [
    path.resolve("scripts/ops/sync-env-key.js"),
    "--source", source,
    "--target", target,
    "--key", "SECRET",
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes("new-value"));
  assert.equal(fs.readFileSync(target, "utf8"), "KEEP=yes\r\nSECRET=new-value\r\n");

  const repeat = spawnSync(process.execPath, [
    path.resolve("scripts/ops/sync-env-key.js"),
    "--source", source,
    "--target", target,
    "--key", "SECRET",
  ], { encoding: "utf8" });
  assert.equal(JSON.parse(repeat.stdout).changed, false);

  console.log(JSON.stringify({
    ok: true,
    tests: ["atomic_env_key_sync", "no_value_disclosure", "idempotency"],
  }, null, 2));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
