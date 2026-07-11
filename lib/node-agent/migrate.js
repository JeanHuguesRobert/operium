import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

export const LATEST_SCHEMA_VERSION = 2;

export function listMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(name => /^\d+_.+\.sql$/.test(name))
    .sort()
    .map(name => {
      const version = Number(name.split("_")[0]);
      return {
        version,
        name,
        path: path.join(MIGRATIONS_DIR, name),
      };
    });
}

export function getAppliedVersions(db) {
  const rows = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
  return new Set(rows.map(row => row.version));
}

export function runMigrations(db, options = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = getAppliedVersions(db);
  const migrations = listMigrations();
  const appliedNow = [];

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    const sql = fs.readFileSync(migration.path, "utf8");
    db.exec(sql);
    const now = new Date().toISOString();
    db.prepare("INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(migration.version, now);
    appliedNow.push(migration.version);
  }

  if (options.seedLocalState !== false) {
    seedLocalState(db, options);
  }

  return {
    latest: LATEST_SCHEMA_VERSION,
    applied: appliedNow,
  };
}

function seedLocalState(db, options = {}) {
  const now = new Date().toISOString();
  const nodeId = String(options.nodeId || "resource://local").trim();
  const hostname = String(options.hostname || "local").trim();

  db.prepare(`
    INSERT INTO local_state (
      node_id, hostname, schema_version, started_at, health_score, updated_at
    ) VALUES (?, ?, ?, ?, 0, ?)
    ON CONFLICT(node_id) DO NOTHING
  `).run(nodeId, hostname, LATEST_SCHEMA_VERSION, now, now);
}

export function tableNames() {
  return [
    "schema_migrations",
    "local_state",
    "probe_history",
    "peer_nodes",
    "peer_snapshots",
    "cop_outbox",
    "cop_inbox",
    "invocation_log",
    "event_log",
    "scheduled_jobs",
  ];
}