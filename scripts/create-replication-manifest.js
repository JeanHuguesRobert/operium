#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const value = (name, fallback = null) => {
  const arg = process.argv.find((item) => item.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
};
const artifacts = process.argv.filter((item) => item.startsWith("--artifact=")).map((item) => {
  const raw = item.slice("--artifact=".length);
  const split = raw.indexOf(":");
  if (split < 1) throw new Error(`Invalid artifact: ${raw}; expected kind:path`);
  const kind = raw.slice(0, split); const file = path.resolve(raw.slice(split + 1));
  const data = fs.readFileSync(file);
  return { kind, path: file.replaceAll("\\", "/"), content_hash: crypto.createHash("sha256").update(data).digest("hex"), size_bytes: data.length };
});
if (!value("source-node") || !value("target-node") || !artifacts.length) throw new Error("Usage: node scripts/create-replication-manifest.js --source-node=local --target-node=fracta --artifact=kind:path");
const sourceCommits = {};
for (const item of process.argv.filter((arg) => arg.startsWith("--commit="))) { const [repo, commit] = item.slice(9).split(":"); sourceCommits[repo] = commit; }
const manifest = { schema: "operium.corpus-replication-manifest.v1", manifest_id: crypto.createHash("sha256").update(JSON.stringify(artifacts)).digest("hex").slice(0, 16), source_node: value("source-node"), target_node: value("target-node"), generated_at: new Date().toISOString(), source_commits: sourceCommits, artifacts };
console.log(JSON.stringify(manifest, null, 2));
