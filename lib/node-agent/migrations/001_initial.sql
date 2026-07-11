-- Operium Node Agent — initial schema (v1)
-- See operium/docs/operium-node-agent.md

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_state (
  node_id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL,
  last_probe_at TEXT,
  last_blackboard_sync_at TEXT,
  health_score INTEGER NOT NULL DEFAULT 0,
  status_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS probe_history (
  id TEXT PRIMARY KEY,
  probe_kind TEXT NOT NULL,
  target TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  result_json TEXT,
  probed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_probe_history_probed_at ON probe_history(probed_at);
CREATE INDEX IF NOT EXISTS idx_probe_history_expires_at ON probe_history(expires_at);

CREATE TABLE IF NOT EXISTS peer_nodes (
  attractor_id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  hostname TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  capabilities TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'offline',
  last_seen TEXT,
  ttl_seconds INTEGER NOT NULL DEFAULT 300,
  fresh INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_peer_nodes_node_id ON peer_nodes(node_id);
CREATE INDEX IF NOT EXISTS idx_peer_nodes_updated_at ON peer_nodes(updated_at);

CREATE TABLE IF NOT EXISTS peer_snapshots (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_peer_snapshots_node_id ON peer_snapshots(node_id);
CREATE INDEX IF NOT EXISTS idx_peer_snapshots_expires_at ON peer_snapshots(expires_at);

CREATE TABLE IF NOT EXISTS cop_outbox (
  id TEXT PRIMARY KEY,
  packet_type TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cop_outbox_state ON cop_outbox(state);
CREATE INDEX IF NOT EXISTS idx_cop_outbox_next_attempt ON cop_outbox(next_attempt_at);

CREATE TABLE IF NOT EXISTS cop_inbox (
  id TEXT PRIMARY KEY,
  packet_type TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  handled_at TEXT,
  handler_result TEXT,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cop_inbox_received_at ON cop_inbox(received_at);
CREATE INDEX IF NOT EXISTS idx_cop_inbox_expires_at ON cop_inbox(expires_at);

CREATE TABLE IF NOT EXISTS invocation_log (
  id TEXT PRIMARY KEY,
  plane TEXT NOT NULL,
  route TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  invoked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invocation_log_invoked_at ON invocation_log(invoked_at);
CREATE INDEX IF NOT EXISTS idx_invocation_log_expires_at ON invocation_log(expires_at);

CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  detail_json TEXT,
  logged_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_log_logged_at ON event_log(logged_at);
CREATE INDEX IF NOT EXISTS idx_event_log_expires_at ON event_log(expires_at);
CREATE INDEX IF NOT EXISTS idx_event_log_kind ON event_log(kind);