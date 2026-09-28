#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";

const schemaSql = fs.readFileSync(path.resolve("schemas/corpus-graph-cache.sql"), "utf8");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "operium-graph-test-"));

function createGraphDb(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const testDb = path.join(dir, "corpus-graph.sqlite");
  const graphDb = new DatabaseSync(testDb);
  graphDb.exec(schemaSql);
  graphDb.close();
  return testDb;
}

// Each child gets its own state directory. Sharing one SQLite file made the
// second boot fail on CI when the first process still held the lock.
function spawnAgent(dir, extraEnv) {
  let stderr = "";
  const child = spawn(process.execPath, ["bin/operium-node-agent.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ONA_COP_DELIVERY: "0",
      ONA_JOBS: "0",
      ONA_NAV_ASSIST_GATEWAY: "0",
      OPERIUM_GRAPH_DB: createGraphDb(dir),
      COGENTIA_OPS_STATE_DIR: dir,
      ...extraEnv,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
  });
  return { child, stderrText: () => stderr.trim() };
}

async function waitForHealth(base, agent) {
  for (let i = 0; i < 40; i++) {
    if (agent.child.exitCode !== null) break;
    try {
      const health = await fetch(`${base}/health`);
      if (health.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const detail = agent.stderrText();
  throw new Error(`Node Agent health did not become ready (${base})${detail ? `: ${detail}` : ""}`);
}

function stopAgent(agent) {
  const { child } = agent;
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

function removeRoot() {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch (error) {
    if (error.code !== "EPERM" && error.code !== "EBUSY") throw error;
  }
}

const child = spawnAgent(path.join(root, "private"), { ONA_BIND: "127.0.0.1", ONA_PORT: "8897" });
const base = "http://127.0.0.1:8897";
try {
  await waitForHealth(base, child);
  const graph = await fetch(`${base}/graph/node/JeanHuguesRobert%2Fcogentia%2342`);
  if (!graph.ok) throw new Error(`graph route returned ${graph.status}`);
  const post = await fetch(`${base}/graph/node/x`, { method: "POST" });
  if (post.status !== 404 && post.status !== 405) throw new Error(`unexpected write status ${post.status}`);
  console.log("Node Agent graph integration: OK");
} finally {
  await stopAgent(child);
}

const publicChild = spawnAgent(path.join(root, "public"), {
  ONA_BIND: "0.0.0.0",
  ONA_PORT: "8898",
  ONA_READ_TOKEN: "test-read",
  ONA_HEALTH_PUBLIC: "1",
});
try {
  await waitForHealth("http://127.0.0.1:8898", publicChild);
  const denied = await fetch("http://127.0.0.1:8898/graph/continuations");
  if (denied.status !== 401) throw new Error(`expected public unauthenticated graph request to return 401, got ${denied.status}`);
  console.log("Node Agent public graph boundary: OK");
} finally {
  await stopAgent(publicChild);
  removeRoot();
}
