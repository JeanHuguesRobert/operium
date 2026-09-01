import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { openNodeMemoryDb } from "./node-agent/db.js";
import { loadRegistry } from "./registry.js";

const execFileAsync = promisify(execFile);

async function onaReachable(host, port, timeoutMs, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch { return false; }
}

function observerRecoveryPolicy(registry, host) {
  return registry.nodes.find(node => node.recovery_observer?.targets?.includes(host))?.recovery_observer || {};
}

function readRecoveryState(db, host) {
  return db.prepare("SELECT hostname, last_attempt_at, last_outcome, cooldown_until, updated_at FROM ona_recovery_state WHERE hostname = ?").get(host) || null;
}

function appendRecoveryReceipt(db, result, observedAt) {
  db.prepare(`
    INSERT INTO ona_recovery_receipts (id, hostname, outcome, attempted, detail_json, observed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    result.host,
    result.outcome,
    result.attempted ? 1 : 0,
    JSON.stringify({ ok: result.ok, error: result.error || null, cooldown_until: result.cooldown_until || null }),
    observedAt,
  );
}

function persistRecoveryResult(db, result, options = {}) {
  if (!db) return result;
  const observedAt = options.observedAt || new Date().toISOString();
  const cooldownMs = Number(options.cooldownMs || 0);
  const cooldownUntil = result.attempted && cooldownMs > 0
    ? new Date(Date.parse(observedAt) + cooldownMs).toISOString()
    : null;
  const persisted = cooldownUntil ? { ...result, cooldown_until: cooldownUntil } : result;
  if (result.attempted) {
    db.prepare(`
      INSERT INTO ona_recovery_state (hostname, last_attempt_at, last_outcome, cooldown_until, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(hostname) DO UPDATE SET
        last_attempt_at = excluded.last_attempt_at,
        last_outcome = excluded.last_outcome,
        cooldown_until = excluded.cooldown_until,
        updated_at = excluded.updated_at
    `).run(result.host, observedAt, result.outcome, cooldownUntil, observedAt);
  }
  appendRecoveryReceipt(db, persisted, observedAt);
  return persisted;
}

function openRecoveryDb(options) {
  if (options.db) return { db: options.db, close: false };
  const opened = openNodeMemoryDb({
    dbPath: options.stateDbPath,
    env: options.env,
    seedLocalState: false,
    backfillCopEvents: false,
  });
  return { db: opened.db, close: true };
}

export async function recoverOna(options = {}) {
  const host = String(options.host || "").trim();
  if (!host) throw new Error("recover_ona_requires_host");
  const registry = loadRegistry({ registryPath: options.registryPath, env: options.env });
  const node = registry.nodes.find(item => item.hostname === host);
  const recovery = node?.operium_node_agent?.recovery;
  if (!recovery?.ssh_command) throw new Error("recover_ona_not_configured");
  const port = Number(node.operium_node_agent.port || 8794);
  const policy = observerRecoveryPolicy(registry, host);
  const cooldownMs = Number(recovery.cooldown_ms || policy.cooldown_ms || 900000);
  const now = options.now || new Date();
  const observedAt = now.toISOString();
  const { db, close } = openRecoveryDb(options);
  const persist = result => persistRecoveryResult(db, result, { observedAt, cooldownMs });
  const runSsh = options.execFileAsync || execFileAsync;
  const delay = options.delay || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const fetchImpl = options.fetch || fetch;
  try {
    if (await onaReachable(host, port, 3000, fetchImpl)) {
      return persist({ ok: true, host, outcome: "already_healthy", attempted: false });
    }
    const prior = readRecoveryState(db, host);
    if (prior?.cooldown_until && Date.parse(prior.cooldown_until) > now.getTime()) {
      return persist({ ok: true, host, outcome: "cooldown_active", attempted: false, cooldown_until: prior.cooldown_until });
    }
    try {
      await runSsh("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", host, "true"], { timeout: 15000, windowsHide: true });
    } catch (error) {
      return persist({ ok: true, host, outcome: "ssh_unreachable", attempted: false, error: error.message });
    }
    try {
      await runSsh("ssh", [host, recovery.ssh_command], { timeout: 15000, windowsHide: true });
    } catch (error) {
      return persist({ ok: false, host, outcome: "restart_failed", attempted: true, error: error.message });
    }
    const waitMs = Number(recovery.wait_ms || 8000);
    await delay(waitMs);
    const healthy = await onaReachable(host, port, 8000, fetchImpl);
    return persist({ ok: healthy, host, outcome: healthy ? "recovered" : "restart_unverified", attempted: true });
  } finally {
    if (close) db.close();
  }
}
