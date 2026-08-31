import { obligationFromWakePacket } from "../cop-wake.js";
import { resolveCloses } from "./cop-resolve.js";
import {
  applyObligationStatus,
  getCalendarObligation,
  listCalendarObligations,
  recordObligationRun,
  resolveInnerPacket,
  upsertCalendarObligation,
} from "./calendar-store.js";
import { appendCopEvent, COP_CALENDAR_KINDS, listCopEvents } from "./cop-events.js";

/**
 * Upgrade path: rows created before cop_events need a wake Event so replay
 * can rebuild them. Catalogue jobs are not in calendar_obligations.
 */
export function backfillWakeEventsFromObligations(db, options = {}) {
  const rows = listCalendarObligations(db);
  let created = 0;
  for (const row of rows) {
    if (row.calendar_origin === "catalogue") continue;
    const existing = listCopEvents(db, {
      obligation_id: row.id,
      kind: COP_CALENDAR_KINDS.WAKE,
      limit: 1,
    });
    if (existing.length) continue;
    const wake = row.config?.wake;
    if (!wake?.payload?.packet && !wake?.payload?.packet_ref) continue;
    appendCopEvent(db, {
      ...wake,
      id: wake.id || `cop:wake:${row.id}:backfill`,
      packet_type: COP_CALENDAR_KINDS.WAKE,
      created_at: wake.created_at || row.created_at || options.now || new Date().toISOString(),
    }, { obligation_id: row.id, now: row.created_at || options.now });
    created += 1;
  }
  return { ok: true, created, scanned: rows.length };
}

/**
 * Rebuild calendar_obligations from the durable COP Event log.
 * Catalogue jobs are not in this table; they stay in scheduled_jobs.
 */
export function replayCalendarObligations(db, options = {}) {
  db.exec("DELETE FROM calendar_obligations");
  const events = listCopEvents(db, { order: "asc", limit: options.limit || 2000 });
  for (const event of events) {
    projectCopEvent(db, event, options);
  }
  return listCalendarObligations(db);
}

export function projectCopEvent(db, event, options = {}) {
  const kind = event.kind || event.envelope?.packet_type;
  const payload = event.envelope?.payload || {};
  const now = event.created_at || options.now;

  if (kind === COP_CALENDAR_KINDS.WAKE) {
    const packet = resolveInnerPacket(db, payload);
    if (!packet) return null;
    const obligation = obligationFromWakePacket(event.envelope, {
      node_id: options.node_id,
      hostname: options.hostname,
      now,
      packet,
    });
    return upsertCalendarObligation(db, obligation, {
      node_id: options.node_id,
      hostname: options.hostname,
      now,
    });
  }

  const obligationId = event.obligation_id || payload.obligation_id;
  if (!obligationId) return null;

  if (kind === COP_CALENDAR_KINDS.EVIDENCE) {
    if (!getCalendarObligation(db, obligationId)) return null;
    return recordObligationRun(db, obligationId, {
      now,
      ok: payload.ok !== false,
      evidence: payload.evidence || payload,
      closed: payload.closed === true,
      status: payload.status,
      next_run_at: payload.next_run_at,
    });
  }

  if (kind === COP_CALENDAR_KINDS.CLOSE) {
    if (!getCalendarObligation(db, obligationId)) return null;
    return applyObligationStatus(db, obligationId, {
      now,
      status: "closed",
      closed: true,
      closed_at: payload.closed_at || now,
    });
  }

  if (kind === COP_CALENDAR_KINDS.ESCALATE) {
    if (!getCalendarObligation(db, obligationId)) return null;
    return applyObligationStatus(db, obligationId, {
      now,
      status: "escalated",
    });
  }

  if (kind === COP_CALENDAR_KINDS.RESOLVE) {
    if (!getCalendarObligation(db, obligationId)) return null;
    const closed = resolveCloses(payload);
    const status = closed
      ? "closed"
      : (payload.decision === "hibernating" ? "paused" : undefined);
    return applyObligationStatus(db, obligationId, {
      now,
      closed,
      status,
      closed_at: closed ? (payload.closed_at || now) : undefined,
      evidence: {
        ok: true,
        pending: !closed,
        authorized: false,
        packet_kind: "continuation",
        hitl: true,
        decision: payload.decision,
        step_result: payload.step_result || null,
        reason: payload.reason || null,
        message: closed ? "continuation_resolved" : "continuation_awaits_judgment",
      },
    });
  }

  return null;
}

export function comparableWakeItems(projection) {
  return (projection.items || [])
    .filter(item => item.calendar_origin === "wake")
    .map(item => ({
      id: item.id,
      kind: item.kind,
      status: item.status,
      run_count: item.run_count,
      last_ok: item.last_ok,
      next_run_at: item.next_run_at,
      closed_at: item.closed_at,
      source_of_truth: item.source_of_truth,
      calendar_origin: item.calendar_origin,
      authorized: item.authorized,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
