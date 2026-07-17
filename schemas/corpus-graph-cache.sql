-- Reconstructible SQLite cache for the Operium Corpus graph.
-- Canonical authority remains Git, registry/configuration, and source frontmatter.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS repositories (
  repository_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  node_id TEXT PRIMARY KEY,
  node_kind TEXT NOT NULL CHECK (node_kind IN ('artifact','repository','continuation','publication','snapshot')),
  repository_id TEXT REFERENCES repositories(repository_id),
  canonical_path TEXT,
  external_url TEXT,
  content_hash TEXT,
  metadata_hash TEXT,
  state TEXT NOT NULL DEFAULT 'observed',
  observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS edges (
  edge_id TEXT PRIMARY KEY,
  from_node_id TEXT NOT NULL REFERENCES nodes(node_id),
  to_node_id TEXT NOT NULL REFERENCES nodes(node_id),
  relation TEXT NOT NULL,
  declaration_ref TEXT,
  source_revision TEXT,
  confidence TEXT NOT NULL DEFAULT 'unknown',
  state TEXT NOT NULL DEFAULT 'observed',
  observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS continuations (
  continuation_id TEXT PRIMARY KEY,
  node_id TEXT REFERENCES nodes(node_id),
  status TEXT NOT NULL,
  next_actor TEXT,
  opened_at TEXT,
  last_reviewed_at TEXT,
  resolved_at TEXT,
  blocked_reason TEXT,
  payload_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  snapshot_id TEXT PRIMARY KEY,
  registry_revision TEXT NOT NULL,
  graph_hash TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  read_only INTEGER NOT NULL CHECK (read_only = 1),
  visibility_mandate TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS edges_from_idx ON edges(from_node_id, relation);
CREATE INDEX IF NOT EXISTS edges_to_idx ON edges(to_node_id, relation);
CREATE INDEX IF NOT EXISTS nodes_path_idx ON nodes(repository_id, canonical_path);
CREATE INDEX IF NOT EXISTS continuations_status_idx ON continuations(status, next_actor);

-- Incremental invalidation rule: a changed content_hash or metadata_hash invalidates
-- only the node, incident edges, and dependent snapshot; unchanged rows are reused.
