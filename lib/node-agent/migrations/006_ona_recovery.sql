-- Durable recovery guard and audit receipts.  This lives in the node-memory
-- database (outside a deployed source checkout) so deploys cannot erase a
-- cooldown or its operational evidence.

CREATE TABLE IF NOT EXISTS ona_recovery_state (
  hostname TEXT PRIMARY KEY,
  last_attempt_at TEXT,
  last_outcome TEXT,
  cooldown_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ona_recovery_state_cooldown
  ON ona_recovery_state(cooldown_until);

CREATE TABLE IF NOT EXISTS ona_recovery_receipts (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  outcome TEXT NOT NULL,
  attempted INTEGER NOT NULL DEFAULT 0,
  detail_json TEXT,
  observed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ona_recovery_receipts_host_time
  ON ona_recovery_receipts(hostname, observed_at DESC);
