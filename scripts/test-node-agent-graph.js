#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const port = 8897;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-graph-test-"));
const sourceDb = path.resolve(".operium/corpus-graph.sqlite");
const testDb = path.join(tempDir, "corpus-graph.sqlite");
fs.copyFileSync(sourceDb, testDb);
const env = { ...process.env, ONA_COP_DELIVERY: "0", OPERIUM_GRAPH_DB: testDb, COGENTIA_OPS_STATE_DIR: tempDir };
const child = spawn(process.execPath, ["bin/operium-node-agent.js"], { cwd: process.cwd(), env: { ...env, ONA_BIND: "127.0.0.1", ONA_PORT: String(port) }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
try {
  let health;
  for (let i = 0; i < 20; i++) { try { health = await fetch(`${base}/health`); if (health.ok) break; } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); }
  if (!health?.ok) throw new Error("Node Agent health did not become ready");
  const graph = await fetch(`${base}/graph/node/JeanHuguesRobert%2Fcogentia%2342`);
  if (!graph.ok) throw new Error(`graph route returned ${graph.status}`);
  const post = await fetch(`${base}/graph/node/x`, { method: "POST" });
  if (post.status !== 404 && post.status !== 405) throw new Error(`unexpected write status ${post.status}`);
console.log("Node Agent graph integration: OK");
} finally { child.kill(); }

const publicChild = spawn(process.execPath, ["bin/operium-node-agent.js"], { cwd: process.cwd(), env: { ...env, ONA_BIND: "0.0.0.0", ONA_PORT: "8898", ONA_READ_TOKEN: "test-read" }, stdio: "ignore" });
try {
  for (let i = 0; i < 20; i++) { try { if ((await fetch("http://127.0.0.1:8898/health")).ok) break; } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); }
  const denied = await fetch("http://127.0.0.1:8898/graph/continuations");
  if (denied.status !== 401) throw new Error(`expected public unauthenticated graph request to return 401, got ${denied.status}`);
  console.log("Node Agent public graph boundary: OK");
} finally {
  publicChild.kill();
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (error) {
    if (error.code !== "EPERM" && error.code !== "EBUSY") throw error;
  }
}
