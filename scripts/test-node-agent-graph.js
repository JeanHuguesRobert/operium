#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";

const port = 8897;
const child = spawn(process.execPath, ["bin/operium-node-agent.js"], { cwd: process.cwd(), env: { ...process.env, ONA_BIND: "127.0.0.1", ONA_PORT: String(port), ONA_COP_DELIVERY: "0", OPERIUM_GRAPH_DB: path.resolve(".operium/corpus-graph.sqlite") }, stdio: "ignore" });
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
