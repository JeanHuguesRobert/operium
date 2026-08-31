import { obligationFromWakePacket } from "../cop-wake.js";
import {
  applyObligationStatus,
  getCalendarObligation,
  listCalendarObligations,
  recordObligationRun,
  upsertCalendarObligation,
} from "./calendar-store.js";
import { COP_CALENDAR_KINDS, listCopEvents } from "./cop-events.js";

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
    const obligation = obligationFromWakePacket(event.envelope, {
      node_id: options.node_id,
      hostname: options.hostname,
      now,
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
