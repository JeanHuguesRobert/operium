#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import {
  isValidEnvKey,
  readKeyFromFile,
  syncKeyToFile,
} from "../../lib/env-key-file.js";

const args = parseArgs(process.argv.slice(2));
if (!args.source || !args.target || !args.key) {
  console.error("usage: node sync-env-key.js --source <env> --target <env> --key <NAME>");
  process.exit(2);
}

if (!isValidEnvKey(args.key)) {
  console.error(JSON.stringify({ ok: false, error: "invalid_env_key" }));
  process.exit(2);
}

const source = readKeyFromFile(args.source, args.key);
if (!source.present || source.empty) {
  console.error(JSON.stringify({ ok: false, error: "source_key_missing", key: args.key }));
  process.exit(1);
}

const result = syncKeyToFile(source.value, args.target, args.key, {
  dryRun: false,
});

console.log(JSON.stringify({
  ok: true,
  schema: "operium.env-key-sync.v1",
  key: args.key,
  source: path.resolve(args.source),
  target: path.resolve(args.target),
  changed: result.changed,
  value_disclosed: false,
}, null, 2));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    out[item.slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}
