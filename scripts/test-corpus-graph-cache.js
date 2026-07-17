#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = new URL("..", import.meta.url).pathname.replace(/^\/[A-Za-z]:/, (m) => m.slice(1));
const schema = path.join(root, "schemas", "corpus-graph-cache.sql");
const db = path.join(os.tmpdir(), `operium-corpus-graph-${process.pid}.db`);
const database = new DatabaseSync(db);
try {
  database.exec(fs.readFileSync(schema, "utf8"));
  const tables = database.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('repositories','nodes','edges','continuations','snapshots')").get().count;
  if (tables !== 5) throw new Error(`expected 5 graph tables, got ${tables}`);
  console.log("Corpus graph cache schema: OK");
} finally { database.close(); try { fs.unlinkSync(db); } catch {} }
