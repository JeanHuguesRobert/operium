-- ONA platform-independent job scheduler (replaces OS cron / Task Scheduler for node jobs)

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  job_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  interval_ms INTEGER NOT NULL DEFAULT 180000,
  enabled INTEGER NOT NULL DEFAULT 1,
  config_json TEXT NOT NULL DEFAULT '{}',
  last_run_at TEXT,
  last_ok INTEGER,
  last_error TEXT,
  next_run_at TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled);