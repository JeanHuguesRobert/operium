import { appendEventLog } from "./db.js";
import { evaluateEscalation, evaluateStopCondition } from "../calendar.js";
import {
  listDueCalendarObligations,
  recordObligationRun,
} from "./calendar-store.js";
import { checkDnsDelegation } from "./dns-watch.js";
import { workKindFromObligation } from "../cop-wake.js";

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

    const stored = recordObligationRun(db, obligation.id, {
      now,
      ok: evidence?.ok !== false,
      evidence: {
        ...evidence,
        stop_condition: stop,
        escalation,
      },
      closed,
      status,
    });

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
    }

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
  const workKind = workKindFromObligation(obligation);
  if (workKind === "dns.watch" || workKind === "observation.dns.delegation") {
    const work = obligation.config?.wake?.payload?.packet?.payload || obligation.config || {};
    return checkDnsDelegation({
      ...work,
      domain: work.domain || obligation.config?.domain || obligation.project,
      expected_ns: work.expected_ns || obligation.config?.expected_ns,
      fetch: options.fetch,
      resolver: options.resolver,
    });
  }

  if (typeof options.runCustom === "function") {
    return options.runCustom(obligation);
  }

  return {
    ok: false,
    error: "unknown_obligation_kind",
    kind: obligation.kind,
  };
}
