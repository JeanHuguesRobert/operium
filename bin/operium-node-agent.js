#!/usr/bin/env node

import { loadOnaConfig } from "../lib/node-agent/config.js";
import { syncLocalIdentity } from "../lib/node-agent/local-state.js";
import { appendEventLog, openNodeMemoryDb } from "../lib/node-agent/db.js";
import { createOnaHttpServer, startOnaHttpServer } from "../lib/node-agent/http-server.js";
import { createJobScheduler } from "../lib/node-agent/job-scheduler.js";
import { createProbeWorker } from "../lib/node-agent/probe-worker.js";
import { resolveNodeMemoryPath, resolveOnaLogPath } from "../lib/node-agent/paths.js";

const startedAt = new Date().toISOString();

function printHelp() {
  console.log(`operium-node-agent — FractaNode control-plane daemon

Usage:
  node bin/operium-node-agent.js
  ONA_COP_DELIVERY=0 node bin/operium-node-agent.js

Environment:
  ONA_BIND              listen address (default 127.0.0.1)
  ONA_PORT              listen port (default 8794)
  ONA_HOSTNAME          catalogue hostname override
  ONA_NODE_ID           node id override (default resource://<hostname>)
  ONA_PROBE_INTERVAL_MS probe interval (default 180000)
  ONA_PROBE_TIMEOUT_MS  per-probe timeout (default 5000)
  ONA_JOBS              enable in-process job scheduler (default 1; 0 to disable)
  ONA_JOB_TICK_MS       scheduler tick interval (default 15000)
  ONA_JOB_INTERVAL_MS   default heartbeat job interval (default 180000)
  ONA_JOB_TIMEOUT_MS    per-job timeout (default 120000)
  ONA_COP_DELIVERY      enable COP outbox delivery (default 1)
  ONA_PEER_TOKEN        required when ONA_COP_DELIVERY=1
  ONA_READ_TOKEN        read API bearer token
  ONA_ADMIN_TOKEN       admin API bearer token
  OPERIUM_REGISTRY      catalogue YAML path
  COGENTIA_BLACKBOARD_URL  aggregator probe target
  COGENTIA_OPS_STATE_DIR  ops state directory
  ONA_DB_PATH           sqlite path override
  ONA_LOG_PATH          structured log file path
  ONA_HEALTH_PUBLIC     allow unauthenticated /health when bind != loopback

Endpoints:
  GET /health
  GET /node/status      (read token when not loopback-only)
  GET /node/peers       (?fresh=1 for fresh attractors only)
  GET /node/snapshot    (full local projection)
  GET /node/drift       (catalogue drift for this node)
  GET /node/logs        (?kind=&limit=&since=)
  POST /node/probe      (ONA_ADMIN_TOKEN)
  POST /node/cop        (ONA_PEER_TOKEN or ONA_ADMIN_TOKEN)
`);
}

async function main() {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  let config;
  try {
    config = loadOnaConfig();
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error.code || "config_failed",
      message: error.message || null,
    }, null, 2));
    process.exit(1);
  }

  const { db, dbPath, migration } = openNodeMemoryDb({
    env: config.env,
    nodeId: config.nodeId,
    hostname: config.hostname,
  });

  const worker = createProbeWorker({ db, config });
  const initial = await worker.runCycle();
  syncLocalIdentity(db, initial.identity);

  appendEventLog(db, "ona.started", {
    node_id: initial.identity.node_id,
    hostname: initial.identity.hostname,
    db_path: dbPath,
    migration,
    log_path: resolveOnaLogPath(config.env),
    memory_path: resolveNodeMemoryPath(config.env),
    initial_probe: initial.summary,
  });

  const server = createOnaHttpServer({
    config,
    db,
    startedAt,
    getNodeId: () => worker.getIdentity().node_id,
    runProbe: (options) => worker.runCycle(options),
  });
  const listen = await startOnaHttpServer(server, config);
  worker.start();

  let jobScheduler = null;
  if (config.jobsEnabled) {
    jobScheduler = createJobScheduler({ db, config });
    jobScheduler.start();
    appendEventLog(db, "ona.jobs_started", {
      jobs: jobScheduler.listJobs().map(job => ({
        job_id: job.job_id,
        kind: job.kind,
        enabled: job.enabled,
      })),
    });
  }

  console.error(JSON.stringify({
    ok: true,
    service: "operium-node-agent",
    url: listen.url,
    node_id: worker.getIdentity().node_id,
    hostname: worker.getIdentity().hostname,
    db_path: dbPath,
    schema_version: migration.latest,
    health_score: initial.summary?.health_score ?? null,
    jobs_enabled: config.jobsEnabled,
    scheduled_jobs: jobScheduler?.listJobs().length ?? 0,
  }, null, 2));

  const shutdown = (signal) => {
    jobScheduler?.stop();
    worker.stop();
    appendEventLog(db, "ona.stopping", { signal });
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.code || "boot_failed",
    message: error.message || null,
  }, null, 2));
  process.exit(1);
});