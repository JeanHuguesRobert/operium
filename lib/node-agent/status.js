import { readLocalState, readLocalStateByNodeId } from "./db.js";
import { listScheduledJobs } from "./job-scheduler.js";
import { readLatestProbes } from "./local-state.js";

export function countRows(db, table, where = null) {
  const sql = where
    ? `SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`
    : `SELECT COUNT(*) AS count FROM ${table}`;
  return Number(db.prepare(sql).get()?.count || 0);
}

export function buildNodeStatus(deps = {}) {
  const config = deps.config;
  const db = deps.db;
  const startedAt = deps.startedAt || new Date().toISOString();
  const nodeId = deps.nodeId || config.nodeId;

  const local = readLocalStateByNodeId(db, nodeId) || readLocalState(db);
  const uptimeSeconds = Math.floor((Date.now() - Date.parse(startedAt)) / 1000);
  const latestProbes = readLatestProbes(db, 8);

  let probeSummary = null;
  if (local?.status_json) {
    try {
      probeSummary = JSON.parse(local.status_json);
    } catch {
      probeSummary = null;
    }
  }

  const applicable = (probeSummary?.probes || []).filter(probe => !probe.skipped);
  const failed = applicable.filter(probe => probe.ok !== true);

  return {
    schema: "operium.node.status.v1",
    node_id: nodeId,
    hostname: local?.hostname || config.hostname,
    ok: failed.length === 0,
    health_score: local?.health_score ?? 0,
    ona_version: config.version,
    uptime_seconds: uptimeSeconds,
    peer_count_fresh: countRows(db, "peer_nodes", "fresh = 1"),
    catalogue: {
      matched: Boolean(probeSummary?.catalogue_node || probeSummary?.resource_id),
      resource_id: probeSummary?.resource_id || null,
      catalogue_hostname: probeSummary?.catalogue_node || null,
    },
    probes: {
      last_at: local?.last_probe_at || null,
      latest: latestProbes,
      applicable_count: applicable.length,
      failed_count: failed.length,
      items: probeSummary?.probes || [],
    },
    jobs: summarizeJobs(listScheduledJobs(db)),
    sqlite_stats: {
      probe_history: countRows(db, "probe_history"),
      cop_outbox_pending: countRows(db, "cop_outbox", "state = 'pending'"),
      peer_nodes: countRows(db, "peer_nodes"),
      event_log: countRows(db, "event_log"),
      scheduled_jobs: countRows(db, "scheduled_jobs"),
    },
    generated_at: new Date().toISOString(),
  };
}

function summarizeJobs(jobs = []) {
  const enabled = jobs.filter(job => job.enabled);
  const failed = enabled.filter(job => job.last_ok === false);
  return {
    total: jobs.length,
    enabled: enabled.length,
    failed_last_run: failed.length,
    items: jobs.map(job => ({
      job_id: job.job_id,
      kind: job.kind,
      interval_ms: job.interval_ms,
      enabled: job.enabled,
      last_run_at: job.last_run_at,
      last_ok: job.last_ok,
      last_error: job.last_error,
      next_run_at: job.next_run_at,
      run_count: job.run_count,
    })),
  };
}