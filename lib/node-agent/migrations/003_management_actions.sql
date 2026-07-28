CREATE TABLE IF NOT EXISTS management_actions (
  action_id TEXT PRIMARY KEY,
  action_name TEXT NOT NULL,
  target_id TEXT NOT NULL,
  state TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  previous_incarnation TEXT,
  current_incarnation TEXT,
  result_json TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_management_actions_state ON management_actions(state);
CREATE INDEX IF NOT EXISTS idx_management_actions_requested_at ON management_actions(requested_at);
