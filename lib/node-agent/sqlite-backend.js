import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let openDatabaseSync = null;
let backendName = null;

function tryNodeSqlite() {
  try {
    const { DatabaseSync } = require("node:sqlite");
    const probe = new DatabaseSync(":memory:");
    probe.close();
    return (path) => new DatabaseSync(path);
  } catch {
    return null;
  }
}

function tryBetterSqlite3() {
  try {
    const Database = require("better-sqlite3");
    const probe = new Database(":memory:");
    probe.close();
    return (path) => new Database(path);
  } catch {
    return null;
  }
}

export function resolveSqliteBackend() {
  if (openDatabaseSync) {
    return { open: openDatabaseSync, name: backendName };
  }

  openDatabaseSync = tryNodeSqlite();
  if (openDatabaseSync) {
    backendName = "node:sqlite";
    return { open: openDatabaseSync, name: backendName };
  }

  openDatabaseSync = tryBetterSqlite3();
  if (openDatabaseSync) {
    backendName = "better-sqlite3";
    return { open: openDatabaseSync, name: backendName };
  }

  throw new Error(
    "No SQLite backend available — install Node >= 22.5 with node:sqlite or add better-sqlite3",
  );
}