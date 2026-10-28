#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = execFileSync(
  process.execPath,
  [
    "bin/operium.js",
    "pause",
    "--dry-run",
    "--json",
    "--issue",
    "inseme/59",
    "--topic",
    "fractalog-act-store-and-forward",
    "--repo",
    "inseme",
    "--no-push",
    "--no-fetch-remotes",
  ],
  { cwd: root, encoding: "utf8" }
);
const result = JSON.parse(output);

assert.equal(result.ok, true);
assert.equal(result.canonical_issue.handle, "inseme/59");
assert.equal(result.topic, "fractalog-act-store-and-forward");
assert.deepEqual(result.repos_scanned.map((repo) => repo.name), ["inseme"]);
assert.deepEqual(result.remotes_notified, []);

console.log(JSON.stringify({ ok: true, test: "pauseCliOptions" }));
