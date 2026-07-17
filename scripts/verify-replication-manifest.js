#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const arg = process.argv.find((item) => item.startsWith("--manifest="));
if (!arg) throw new Error("Usage: node scripts/verify-replication-manifest.js --manifest=manifest.json");
const manifest = JSON.parse(fs.readFileSync(arg.slice(11), "utf8"));
const results = manifest.artifacts.map((artifact) => {
  try {
    const data = fs.readFileSync(artifact.path);
    const hash = crypto.createHash("sha256").update(data).digest("hex");
    return { path: artifact.path, state: hash === artifact.content_hash && data.length === artifact.size_bytes ? "verified" : "mismatch", expected_hash: artifact.content_hash, actual_hash: hash, expected_size: artifact.size_bytes, actual_size: data.length };
  } catch (error) { return { path: artifact.path, state: "missing", error: error.message }; }
});
const report = { schema: "operium.corpus-replication-verification.v1", generated_at: new Date().toISOString(), manifest_id: manifest.manifest_id, verified: results.every((item) => item.state === "verified"), results };
console.log(JSON.stringify(report, null, 2));
if (!report.verified) process.exitCode = 2;
