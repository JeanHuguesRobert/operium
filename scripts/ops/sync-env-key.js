#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));
if (!args.source || !args.target || !args.key) {
  console.error("usage: node sync-env-key.js --source <env> --target <env> --key <NAME>");
  process.exit(2);
}

const keyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
if (!keyPattern.test(args.key)) {
  console.error(JSON.stringify({ ok: false, error: "invalid_env_key" }));
  process.exit(2);
}

const sourceText = fs.readFileSync(args.source, "utf8");
const source = readValue(sourceText, args.key);
if (source == null || source === "") {
  console.error(JSON.stringify({ ok: false, error: "source_key_missing", key: args.key }));
  process.exit(1);
}

const targetExists = fs.existsSync(args.target);
const targetText = targetExists ? fs.readFileSync(args.target, "utf8") : "";
const newline = targetText.includes("\r\n") ? "\r\n" : "\n";
const nextText = writeValue(targetText, args.key, source, newline);
const changed = nextText !== targetText;

if (changed) {
  fs.mkdirSync(path.dirname(args.target), { recursive: true });
  const temp = `${args.target}.operium-${process.pid}.tmp`;
  fs.writeFileSync(temp, nextText, { mode: targetExists ? undefined : 0o600 });
  if (targetExists) {
    const stat = fs.statSync(args.target);
    fs.chmodSync(temp, stat.mode);
  }
  fs.renameSync(temp, args.target);
}

console.log(JSON.stringify({
  ok: true,
  schema: "operium.env-key-sync.v1",
  key: args.key,
  source: path.resolve(args.source),
  target: path.resolve(args.target),
  changed,
  value_disclosed: false,
}, null, 2));

function readValue(text, key) {
  const prefix = `${key}=`;
  const line = String(text).split(/\r?\n/).find(item => item.startsWith(prefix));
  return line == null ? null : line.slice(prefix.length);
}

function writeValue(text, key, value, newline) {
  const lines = String(text).split(/\r?\n/);
  const prefix = `${key}=`;
  let replaced = false;
  const next = lines.map((line) => {
    if (!line.startsWith(prefix)) return line;
    if (replaced) return null;
    replaced = true;
    return `${prefix}${value}`;
  }).filter(line => line != null);
  if (!replaced) {
    if (next.length && next.at(-1) !== "") next.push("");
    next.push(`${prefix}${value}`);
  }
  while (next.length > 1 && next.at(-1) === "" && next.at(-2) === "") next.pop();
  return `${next.join(newline).replace(new RegExp(`${escapeRegExp(newline)}+$`), "")}${newline}`;
}

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
