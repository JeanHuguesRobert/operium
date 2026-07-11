#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadOnaConfig } from "../lib/node-agent/config.js";
import { openNodeMemoryDb } from "../lib/node-agent/db.js";
import { loadEnvFiles } from "../lib/node-agent/job-env.js";
import { resolveNodeJobs, resolveScriptPath } from "../lib/node-agent/job-registry.js";
import { runScheduledJob } from "../lib/node-agent/job-runner.js";
import {
  createJobScheduler,
  listScheduledJobs,
  syncScheduledJobs,
} from "../lib/node-agent/job-scheduler.js";
import { LATEST_SCHEMA_VERSION } from "../lib/node-agent/migrate.js";
import { buildNodeStatus } from "../lib/node-agent/status.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "operium-ona-jobs-"));
const dbPath = path.join(tmpDir, "node_memory.sqlite");

const mockNode = {
  hostname: "i7-thinkpad-jhr",
  resource_id: "resource://i7-thinkpad-jhr",
  operium_node_agent: {
    blackboard_env: path.join(tmpDir, "ona-blackboard.env"),
    secrets_file: path.join(tmpDir, "ona.env"),
  },
  agent_gateway: {
    heartbeat_script: "cogentia/scripts/ops/agent-gateway-heartbeat.js",
    blackboard_env: path.join(tmpDir, "gateway-blackboard.env"),
  },
  blackboard: {
    attractor_id: "attractor:i7-thinkpad-jhr:retrieval-inline",
  },
};

fs.writeFileSync(
  mockNode.operium_node_agent.blackboard_env,
  "export COGENTIA_BLACKBOARD_URL=https://example.test/ops/blackboard\nexport COGENTIA_BLACKBOARD_UPSERT_TOKEN=test-token\n",
  "utf8",
);
const attractorEnvDir = path.join(tmpDir, ".cogentia", "secrets");
fs.mkdirSync(attractorEnvDir, { recursive: true });
fs.writeFileSync(
  path.join(attractorEnvDir, "attractor-i7-thinkpad-jhr.env"),
  "export COGENTIA_BLACKBOARD_URL=https://example.test/ops/blackboard\nexport COGENTIA_BLACKBOARD_UPSERT_TOKEN=test-token\n",
  "utf8",
);

const config = loadOnaConfig({
  ONA_COP_DELIVERY: "0",
  ONA_HOSTNAME: "i7-thinkpad-jhr",
  ONA_JOBS: "1",
  ONA_JOB_INTERVAL_MS: "60000",
  COGENTIA_BLACKBOARD_URL: "https://example.test/ops/blackboard",
  HOME: tmpDir,
  USERPROFILE: tmpDir,
});

const jobs = resolveNodeJobs({
  config,
  catalogueNode: mockNode,
  hostname: "i7-thinkpad-jhr",
});
assert.ok(jobs.some(job => job.job_id === "heartbeat:operium-node"));
assert.equal(jobs.find(job => job.job_id === "heartbeat:operium-node")?.kind, "ona.heartbeat");
assert.ok(jobs.some(job => job.job_id === "heartbeat:agent-gateway"));
assert.ok(jobs.some(job => job.job_id === "heartbeat:retrieval-inline"));

const attractorScript = resolveScriptPath("cogentia/scripts/ops/attractor-heartbeat.js", config.env);
assert.ok(attractorScript && fs.existsSync(attractorScript), "attractor heartbeat script should resolve");

const env = loadEnvFiles([mockNode.operium_node_agent.blackboard_env], {});
assert.equal(env.COGENTIA_BLACKBOARD_URL, "https://example.test/ops/blackboard");

const { db, migration } = openNodeMemoryDb({
  dbPath,
  nodeId: "resource://i7-thinkpad-jhr",
  hostname: "i7-thinkpad-jhr",
});
assert.equal(migration.latest, LATEST_SCHEMA_VERSION);
assert.ok(migration.applied.includes(2));

const synced = syncScheduledJobs(db, jobs);
assert.equal(synced.length, 3);

createJobScheduler({ db, config, tickMs: 60_000 });

// Exercise in-process ONA heartbeat with mocked fetch (no real blackboard)
const onaJob = listScheduledJobs(db).find(job => job.job_id === "heartbeat:operium-node");
const mockFetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, snapshot_at: new Date().toISOString() }),
});

const onaResult = await runScheduledJob(onaJob, {
  config,
  env: config.env,
  fetch: mockFetch,
});
assert.equal(onaResult.ok, true);
assert.equal(onaResult.event, "cop/attractor.advertised");

const attractorJob = listScheduledJobs(db).find(job => job.job_id === "heartbeat:retrieval-inline");
const attractorResult = await runScheduledJob(attractorJob, {
  config,
  env: loadEnvFiles([path.join(attractorEnvDir, "attractor-i7-thinkpad-jhr.env")], config.env),
  fetch: mockFetch,
});
assert.equal(attractorResult.ok, true);
assert.equal(attractorResult.event, "cop/attractor.advertised");

const status = buildNodeStatus({
  config,
  db,
  nodeId: config.nodeId,
  startedAt: new Date().toISOString(),
});
assert.ok(status.jobs);
assert.equal(status.jobs.total, 3);
assert.ok(status.sqlite_stats.scheduled_jobs >= 3);

db.close();
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(JSON.stringify({
  ok: true,
  jobs: true,
  migration: LATEST_SCHEMA_VERSION,
  resolved_job_kinds: jobs.map(job => job.job_id),
}, null, 2));