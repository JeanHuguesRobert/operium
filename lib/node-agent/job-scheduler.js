import { loadRegistry } from "../registry.js";
import { appendEventLog } from "./db.js";
import { resolvedIdentity } from "./catalogue.js";
import { runScheduledJob } from "./job-runner.js";
import { resolveNodeJobs } from "./job-registry.js";

export function syncScheduledJobs(db, jobs, options = {}) {
  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO scheduled_jobs (
      job_id, kind, interval_ms, enabled, config_json, next_run_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(job_id) DO UPDATE SET
      kind = excluded.kind,
      interval_ms = excluded.interval_ms,
      enabled = excluded.enabled,
      config_json = excluded.config_json,
      updated_at = excluded.updated_at
  `);

  const existing = new Set(
    db.prepare("SELECT job_id FROM scheduled_jobs").all().map(row => row.job_id),
  );

  for (const job of jobs) {
    const nextRun = computeInitialNextRun(db, job.job_id, job.interval_ms);
    upsert.run(
      job.job_id,
      job.kind,
      job.interval_ms,
      job.enabled ? 1 : 0,
      JSON.stringify(job.config || {}),
      nextRun,
      now,
    );
    existing.delete(job.job_id);
  }

  if (options.prune !== false) {
    for (const staleId of existing) {
      db.prepare("DELETE FROM scheduled_jobs WHERE job_id = ?").run(staleId);
    }
  }

  return listScheduledJobs(db);
}

export function listScheduledJobs(db) {
  return db.prepare(`
    SELECT job_id, kind, interval_ms, enabled, config_json,
           last_run_at, last_ok, last_error, next_run_at, run_count, updated_at
    FROM scheduled_jobs
    ORDER BY job_id
  `).all().map(formatJobRow);
}

function formatJobRow(row) {
  let config = {};
  try {
    config = JSON.parse(row.config_json || "{}");
  } catch {
    config = {};
  }
  return {
    job_id: row.job_id,
    kind: row.kind,
    interval_ms: row.interval_ms,
    enabled: row.enabled === 1,
    config,
    last_run_at: row.last_run_at,
    last_ok: row.last_ok == null ? null : row.last_ok === 1,
    last_error: row.last_error,
    next_run_at: row.next_run_at,
    run_count: row.run_count,
    updated_at: row.updated_at,
  };
}

function computeInitialNextRun(db, jobId, intervalMs) {
  const row = db.prepare("SELECT next_run_at FROM scheduled_jobs WHERE job_id = ?").get(jobId);
  if (row?.next_run_at) return row.next_run_at;
  return new Date(Date.now() + Math.min(intervalMs, 30_000)).toISOString();
}

export function createJobScheduler(deps = {}) {
  const db = deps.db;
  const config = deps.config;
  const tickMs = Number(deps.tickMs || config?.jobTickMs || 15_000);
  let timer = null;
  let syncing = false;
  let runningJob = false;

  function loadCatalogueJobs() {
    const catalogue = loadRegistry({
      registryPath: config.registryPath,
      env: config.env,
    });
    const identity = resolvedIdentity(catalogue, config);
    return resolveNodeJobs({
      config,
      catalogue,
      catalogueNode: identity.catalogue_node,
      hostname: identity.hostname,
    });
  }

  function refreshRegistry() {
    const jobs = loadCatalogueJobs();
    return syncScheduledJobs(db, jobs);
  }

  async function runDueJobs(options = {}) {
    if (runningJob && !options.force) {
      return { ok: true, skipped: "job_in_progress" };
    }
    runningJob = true;

    const nowIso = new Date().toISOString();
    const due = db.prepare(`
      SELECT job_id, kind, interval_ms, enabled, config_json
      FROM scheduled_jobs
      WHERE enabled = 1
        AND (next_run_at IS NULL OR next_run_at <= ?)
      ORDER BY next_run_at ASC
    `).all(nowIso);

    const results = [];
    try {
    for (const row of due) {
      const job = formatJobRow(row);
      const started = Date.now();
      let result;
      try {
        result = await runScheduledJob(job, {
          config,
          env: config.env,
          fetch: options.fetch,
          spawnImpl: options.spawnImpl,
        });
      } catch (error) {
        result = {
          ok: false,
          exitCode: 1,
          error: error.message || "job_failed",
        };
      }

      const finishedAt = new Date().toISOString();
      const nextRun = new Date(Date.now() + job.interval_ms).toISOString();
      db.prepare(`
        UPDATE scheduled_jobs
        SET last_run_at = ?,
            last_ok = ?,
            last_error = ?,
            next_run_at = ?,
            run_count = run_count + 1,
            updated_at = ?
        WHERE job_id = ?
      `).run(
        finishedAt,
        result.ok ? 1 : 0,
        result.ok ? null : String(result.error || result.detail || "failed").slice(0, 500),
        nextRun,
        finishedAt,
        job.job_id,
      );

      if (options.log !== false) {
        appendEventLog(db, "ona.job.completed", {
          job_id: job.job_id,
          kind: job.kind,
          ok: result.ok,
          duration_ms: Date.now() - started,
          error: result.error || null,
          attractor_id: result.attractor_id || null,
          event: result.event || null,
        });
      }

      results.push({ job_id: job.job_id, ...result });
    }
    } finally {
      runningJob = false;
    }

    return { ok: true, ran: results.length, results };
  }

  async function tick(options = {}) {
    if (syncing) return { ok: false, error: "sync_in_progress" };
    syncing = true;
    try {
      if (options.refresh !== false) {
        refreshRegistry();
      }
      return await runDueJobs(options);
    } finally {
      syncing = false;
    }
  }

  function start() {
    if (timer) return;
    refreshRegistry();
    timer = setInterval(() => {
      tick().catch((error) => {
        appendEventLog(db, "ona.job_tick_failed", {
          message: error.message || null,
        });
      });
    }, tickMs);
    if (typeof timer.unref === "function") timer.unref();
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return {
    refreshRegistry,
    runDueJobs,
    tick,
    start,
    stop,
    listJobs: () => listScheduledJobs(db),
  };
}