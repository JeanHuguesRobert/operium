#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { findDuplicateEnvKeys } from "../lib/node-agent/job-env.js";

const files = [];
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg === "--file") {
    const file = process.argv[++index];
    if (!file) throw new Error("--file requires a path");
    files.push(path.resolve(file));
    continue;
  }
  if (arg === "--help" || arg === "-h") {
    console.log("Usage: node scripts/validate-env-keys.js --file <env-file> [--file <env-file> ...]");
    process.exit(0);
  }
  throw new Error(`Unknown argument: ${arg}`);
}

if (!files.length) throw new Error("At least one --file is required");

const results = files.map(file => ({
  file,
  duplicate_keys: findDuplicateEnvKeys(fs.readFileSync(file, "utf8")),
}));
const ok = results.every(result => result.duplicate_keys.length === 0);
console.log(JSON.stringify({ schema: "operium.env-key-validation.v1", ok, files: results }, null, 2));
process.exitCode = ok ? 0 : 1;
