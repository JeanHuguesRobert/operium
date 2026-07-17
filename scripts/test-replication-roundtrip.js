#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const source = path.resolve("schemas/corpus-graph-cache.sql");
const data = fs.readFileSync(source);
const manifest = { schema: "operium.corpus-replication-manifest.v1", manifest_id: crypto.createHash("sha256").update(data).digest("hex").slice(0, 16), source_node: "local", target_node: "fracta", generated_at: new Date().toISOString(), source_commits: {}, artifacts: [{ kind: "graph", path: source.replaceAll("\\", "/"), content_hash: crypto.createHash("sha256").update(data).digest("hex"), size_bytes: data.length }] };
const file = path.join(os.tmpdir(), `operium-manifest-${process.pid}.json`);
try { fs.writeFileSync(file, JSON.stringify(manifest)); const report = JSON.parse((await import("node:child_process")).execFileSync(process.execPath, ["scripts/verify-replication-manifest.js", `--manifest=${file}`], { encoding: "utf8" })); if (!report.verified) throw new Error("roundtrip verification failed"); console.log("Replication manifest roundtrip: OK"); } finally { try { fs.unlinkSync(file); } catch {} }
