import { computeNextRun, evaluateEscalation, evaluateStopCondition } from "../calendar.js";
import { workKindFromObligation } from "../cop-wake.js";
import {
  listDueCalendarObligations,
  recordObligationRun,
} from "./calendar-store.js";
import { appendCopEvent, COP_CALENDAR_KINDS } from "./cop-events.js";
import { appendEventLog } from "./db.js";
import { checkDnsDelegation } from "./dns-watch.js";

export const CALENDAR_WAKE_HANDLERS = {
  "observation.dns.delegation": runDnsObservation,
  "dns.watch": runDnsObservation,
  continuation: runContinuation,
};

export async function runDueCalendarObligations(db, options = {}) {
  const now = options.now || new Date().toISOString();
  const due = listDueCalendarObligations(db, now);
  const results = [];

  for (const obligation of due) {
    const started = Date.now();
    let evidence;
    try {
      evidence = await runObligation(obligation, options);
    } catch (error) {
      evidence = {
        ok: false,
        error: error.message || "obligation_failed",
      };
    }

    const stop = evaluateStopCondition(obligation.stop_condition, evidence);
    const escalation = evaluateEscalation(obligation, now);
    const closed = stop.met === true;
    const status = closed
      ? "closed"
      : (escalation.escalated ? "escalated" : obligation.status);
    const nextRun = closed
      ? null
      : computeNextRun({
        cadence: obligation.cadence_or_trigger,
        earliest_at: obligation.earliest_at,
        last_run_at: now,
        run_count: (obligation.run_count || 0) + 1,
        now,
      });
    const evidencePayload = {
      ...evidence,
      stop_condition: stop,
      escalation,
    };

    if (options.log !== false) {
      appendEventLog(db, closed ? "ona.calendar.closed" : "ona.calendar.ran", {
        id: obligation.id,
        kind: obligation.kind,
        ok: evidence?.ok !== false,
        closed,
        status,
        duration_ms: Date.now() - started,
        stop_reason: stop.reason,
        escalation: escalation.reason,
      });
      appendCopEvent(db, {
        id: `cop:evidence:${obligation.id}:${now}`,
        packet_type: COP_CALENDAR_KINDS.EVIDENCE,
        created_at: now,
        payload: {
          schema: COP_CALENDAR_KINDS.EVIDENCE,
          obligation_id: obligation.id,
          ok: evidence?.ok !== false,
          closed,
          status,
          next_run_at: nextRun,
          evidence: evidencePayload,
        },
      }, { obligation_id: obligation.id, now });

      if (closed) {
        appendCopEvent(db, {
          id: `cop:close:${obligation.id}:${now}`,
          packet_type: COP_CALENDAR_KINDS.CLOSE,
          created_at: now,
          payload: {
            schema: COP_CALENDAR_KINDS.CLOSE,
            obligation_id: obligation.id,
            closed_at: now,
            reason: stop.reason,
          },
        }, { obligation_id: obligation.id, now });
      } else if (escalation.escalated) {
        appendCopEvent(db, {
          id: `cop:escalate:${obligation.id}:${now}`,
          packet_type: COP_CALENDAR_KINDS.ESCALATE,
          created_at: now,
          payload: {
            schema: COP_CALENDAR_KINDS.ESCALATE,
            obligation_id: obligation.id,
            reason: escalation.reason,
          },
        }, { obligation_id: obligation.id, now });
      }
    }

    const stored = recordObligationRun(db, obligation.id, {
      now,
      ok: evidence?.ok !== false,
      evidence: evidencePayload,
      closed,
      status,
      next_run_at: nextRun,
    });

    results.push({
      id: obligation.id,
      kind: obligation.kind,
      ok: evidence?.ok !== false,
      closed,
      status: stored.status,
      next_run_at: stored.next_run_at,
      evidence,
    });
  }

  return { ok: true, ran: results.length, results };
}

async function runObligation(obligation, options) {
  const key = handlerKey(obligation);
  const handler = CALENDAR_WAKE_HANDLERS[key];
  if (handler) return handler(obligation, options);
  if (typeof options.runCustom === "function") {
    return options.runCustom(obligation);
  }
  return {
    ok: false,
    error: "unknown_obligation_kind",
    kind: obligation.kind,
  };
}

function handlerKey(obligation) {
  const packetKind = String(
    obligation.config?.wake?.payload?.packet?.envelope?.packet_kind || "",
  ).trim();
  const workKind = workKindFromObligation(obligation);
  if (packetKind === "continuation" || workKind === "continuation" || workKind.startsWith("continuation.")) {
    return "continuation";
  }
  return workKind;
}

async function runDnsObservation(obligation, options) {
  const work = obligation.config?.wake?.payload?.packet?.payload || obligation.config || {};
  return checkDnsDelegation({
    ...work,
    domain: work.domain || obligation.config?.domain || obligation.project,
    expected_ns: work.expected_ns || obligation.config?.expected_ns,
    fetch: options.fetch,
    resolver: options.resolver,
  });
}

function runContinuation(obligation) {
  return {
    ok: true,
    pending: true,
    authorized: false,
    packet_kind: "continuation",
    kind: workKindFromObligation(obligation) || "continuation",
    message: "continuation_awaits_judgment",
  };
}
