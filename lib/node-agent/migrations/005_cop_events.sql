-- Durable COP Event log. Source of truth for calendar wake obligations.
-- calendar_obligations is a projection rebuildable from this table.
-- Warm event_log stays operational breadcrumbs and remains TTL-swept.

CREATE TABLE IF NOT EXISTS cop_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  obligation_id TEXT,
  envelope_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cop_events_created_at
  ON cop_events(created_at);
CREATE INDEX IF NOT EXISTS idx_cop_events_obligation
  ON cop_events(obligation_id, seq);
CREATE INDEX IF NOT EXISTS idx_cop_events_kind
  ON cop_events(kind);
