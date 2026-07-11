import { randomUUID } from "node:crypto";
import { parseBooleanEnv } from "./config.js";
import { openNodeMemoryDb } from "./db.js";

const INVOCATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_INVOCATION_ROWS = 1000;

export function shouldLogActionInvocations(env = process.env) {
  return parseBooleanEnv(env.OPERIUM_LOG_ACTIONS, false);
}

export function appendInvocationLog(db, entry = {}) {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + INVOCATION_TTL_MS).toISOString();

  db.prepare(`
    INSERT INTO invocation_log (id, plane, route, ok, summary, invoked_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(entry.id || `inv:${randomUUID()}`),
    String(entry.plane || "action"),
    String(entry.route || "POST /ops/route/action"),
    entry.ok === true || entry.ok === 1 ? 1 : 0,
    entry.summary ? String(entry.summary).slice(0, 500) : null,
    now,
    expiresAt,
  );

  pruneInvocationLog(db);
  return { id: entry.id, invoked_at: now };
}

export function logActionInvocation(options = {}) {
  const env = options.env || process.env;
  if (!shouldLogActionInvocations(env)) {
    return { logged: false, skipped: true };
  }

  const { db } = openNodeMemoryDb({ env });
  try {
    const row = appendInvocationLog(db, {
      plane: "action",
      route: options.route || "POST /ops/route/action",
      ok: options.ok,
      summary: options.summary || null,
    });
    return { logged: true, ...row };
  } finally {
    db.close();
  }
}

function pruneInvocationLog(db) {
  const count = Number(db.prepare("SELECT COUNT(*) AS count FROM invocation_log").get()?.count || 0);
  if (count <= MAX_INVOCATION_ROWS) return;

  const excess = count - MAX_INVOCATION_ROWS;
  db.prepare(`
    DELETE FROM invocation_log
    WHERE id IN (
      SELECT id FROM invocation_log
      ORDER BY invoked_at ASC
      LIMIT ?
    )
  `).run(excess);
}