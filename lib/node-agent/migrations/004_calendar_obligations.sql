-- FractaCalendar: non-periodic temporal obligations with stop conditions.
-- Scheduled jobs remain the source of truth for catalogue cadences.

CREATE TABLE IF NOT EXISTS calendar_obligations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  owner_or_mandate TEXT,
  scope TEXT,
  target_node TEXT,
  service TEXT,
  project TEXT,
  earliest_at TEXT,
  next_run_at TEXT,
  cadence_json TEXT,
  deadline TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  interruptible INTEGER NOT NULL DEFAULT 1,
  budget_json TEXT,
  stop_condition_json TEXT NOT NULL DEFAULT '{"type":"none"}',
  escalation_json TEXT,
  last_run_at TEXT,
  last_ok INTEGER,
  last_evidence_json TEXT,
  source_of_truth TEXT NOT NULL,
  authorized INTEGER NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL DEFAULT '{}',
  run_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_calendar_obligations_next_run
  ON calendar_obligations(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_calendar_obligations_node
  ON calendar_obligations(target_node);
CREATE INDEX IF NOT EXISTS idx_calendar_obligations_service
  ON calendar_obligations(service, project);
