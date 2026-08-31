import {
  computeNextRun,
  normalizeObligation,
} from "../calendar.js";
import { dnsObservationWakePacket, obligationFromWakePacket } from "../cop-wake.js";

export function listCalendarObligations(db, options = {}) {
  const clauses = [];
  const params = [];
  if (options.status) {
    clauses.push("status = ?");
    params.push(options.status);
  }
  if (options.kind) {
    clauses.push("kind = ?");
    params.push(options.kind);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(`
    SELECT * FROM calendar_obligations
    ${where}
    ORDER BY COALESCE(next_run_at, deadline, created_at)
  `).all(...params).map(formatRow);
}

export function listDueCalendarObligations(db, nowIso) {
  return db.prepare(`
    SELECT * FROM calendar_obligations
    WHERE status IN ('active', 'escalated')
      AND (next_run_at IS NULL OR next_run_at <= ?)
    ORDER BY next_run_at ASC
  `).all(nowIso).map(formatRow);
}

export function getCalendarObligation(db, id) {
  const row = db.prepare("SELECT * FROM calendar_obligations WHERE id = ?").get(id);
  return row ? formatRow(row) : null;
}

export function upsertCalendarObligation(db, raw, context = {}) {
  const obligation = normalizeObligation(raw, context);
  if (!obligation.id) throw new Error("calendar_obligation_requires_id");
  const now = context.now || new Date().toISOString();
  const existing = getCalendarObligation(db, obligation.id);
  const createdAt = existing?.created_at || obligation.created_at || now;
  const nextRun = obligation.next_run_at || computeNextRun({
    cadence: obligation.cadence_or_trigger,
    earliest_at: obligation.earliest_at,
    last_run_at: obligation.last_run_at,
    run_count: obligation.run_count,
    now,
  });

  db.prepare(`
    INSERT INTO calendar_obligations (
      id, kind, status, owner_or_mandate, scope, target_node, service, project,
      earliest_at, next_run_at, cadence_json, deadline, priority, interruptible,
      budget_json, stop_condition_json, escalation_json, last_run_at, last_ok,
      last_evidence_json, source_of_truth, authorized, config_json, run_count,
      created_at, updated_at, closed_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      status = excluded.status,
      owner_or_mandate = excluded.owner_or_mandate,
      scope = excluded.scope,
      target_node = excluded.target_node,
      service = excluded.service,
      project = excluded.project,
      earliest_at = excluded.earliest_at,
      next_run_at = excluded.next_run_at,
      cadence_json = excluded.cadence_json,
      deadline = excluded.deadline,
      priority = excluded.priority,
      interruptible = excluded.interruptible,
      budget_json = excluded.budget_json,
      stop_condition_json = excluded.stop_condition_json,
      escalation_json = excluded.escalation_json,
      source_of_truth = excluded.source_of_truth,
      config_json = excluded.config_json,
      updated_at = excluded.updated_at,
      closed_at = excluded.closed_at
  `).run(
    obligation.id,
    obligation.kind,
    obligation.status,
    obligation.owner_or_mandate,
    obligation.scope,
    obligation.target_node,
    obligation.service,
    obligation.project,
    obligation.earliest_at,
    nextRun,
    json(obligation.cadence_or_trigger),
    obligation.deadline,
    obligation.priority,
    obligation.interruptible ? 1 : 0,
    json(obligation.budget),
    json(obligation.stop_condition || { type: "none" }),
    json(obligation.escalation_policy),
    obligation.last_run_at,
    obligation.last_ok == null ? null : (obligation.last_ok ? 1 : 0),
    json(obligation.last_evidence),
    obligation.source_of_truth,
    0,
    json(obligation.config),
    obligation.run_count || 0,
    createdAt,
    now,
    obligation.closed_at,
  );

  return getCalendarObligation(db, obligation.id);
}

export function upsertDnsWatch(db, spec, context = {}) {
  return upsertWakePacket(db, dnsObservationWakePacket(spec, context), context);
}

export function upsertWakePacket(db, body, context = {}) {
  return upsertCalendarObligation(db, obligationFromWakePacket(body, context), context);
}

export function recordObligationRun(db, id, update = {}) {
  const existing = getCalendarObligation(db, id);
  if (!existing) throw new Error(`unknown_calendar_obligation:${id}`);
  const now = update.now || new Date().toISOString();
  const closed = Boolean(update.closed);
  const status = closed
    ? "closed"
    : (update.status || existing.status);
  const nextRun = closed
    ? null
    : (update.next_run_at || computeNextRun({
      cadence: existing.cadence_or_trigger,
      earliest_at: existing.earliest_at,
      last_run_at: now,
      run_count: existing.run_count + 1,
      now,
    }));

  db.prepare(`
    UPDATE calendar_obligations
    SET status = ?,
        last_run_at = ?,
        last_ok = ?,
        last_evidence_json = ?,
        next_run_at = ?,
        run_count = run_count + 1,
        updated_at = ?,
        closed_at = ?
    WHERE id = ?
  `).run(
    status,
    now,
    update.ok === false ? 0 : 1,
    json(update.evidence || null),
    nextRun,
    now,
    closed ? (update.closed_at || now) : existing.closed_at,
    id,
  );

  return getCalendarObligation(db, id);
}

function formatRow(row) {
  return normalizeObligation({
    id: row.id,
    kind: row.kind,
    status: row.status,
    owner_or_mandate: row.owner_or_mandate,
    scope: row.scope,
    target_node: row.target_node,
    service: row.service,
    project: row.project,
    earliest_at: row.earliest_at,
    next_run_at: row.next_run_at,
    cadence_or_trigger: parseJson(row.cadence_json),
    deadline: row.deadline,
    priority: row.priority,
    interruptible: row.interruptible === 1,
    budget: parseJson(row.budget_json),
    stop_condition: parseJson(row.stop_condition_json) || { type: "none" },
    escalation_policy: parseJson(row.escalation_json),
    last_run_at: row.last_run_at,
    last_ok: row.last_ok == null ? null : row.last_ok === 1,
    last_evidence: parseJson(row.last_evidence_json),
    source_of_truth: row.source_of_truth,
    executes: true,
    config: parseJson(row.config_json) || {},
    run_count: row.run_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
    closed_at: row.closed_at,
  });
}

function json(value) {
  return value == null ? null : JSON.stringify(value);
}

function parseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
