import { DatabaseSync } from "node:sqlite";
import { ensureParentDir, resolveNodeMemoryPath } from "./paths.js";
import { runMigrations } from "./migrate.js";

export function openNodeMemoryDb(options = {}) {
  const dbPath = options.dbPath || resolveNodeMemoryPath(options.env);
  if (options.dbPath !== ":memory:") {
    ensureParentDir(dbPath);
  }

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  const migration = runMigrations(db, {
    env: options.env,
    nodeId: options.nodeId,
    hostname: options.hostname,
    seedLocalState: options.seedLocalState,
  });

  return { db, dbPath, migration };
}

export function appendEventLog(db, kind, detail = null) {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO event_log (kind, detail_json, logged_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(
    kind,
    detail ? JSON.stringify(detail) : null,
    now,
    expiresAt,
  );
}

export function readLocalState(db) {
  return db.prepare("SELECT * FROM local_state LIMIT 1").get() || null;
}

export function readLocalStateByNodeId(db, nodeId) {
  if (!nodeId) return null;
  return db.prepare("SELECT * FROM local_state WHERE node_id = ?").get(nodeId) || null;
}