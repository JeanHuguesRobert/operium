import { workKindFromObligation } from "../cop-wake.js";
import { applyObligationStatus, getCalendarObligation } from "./calendar-store.js";
import { appendCopEvent, COP_CALENDAR_KINDS } from "./cop-events.js";

export const RESOLVE_PACKET_TYPE = "cop/node.resolve.v1";

const CLOSE_DECISIONS = new Set(["resolved", "cancelled"]);
const CLOSE_STEP_STATUSES = new Set(["success", "failed", "cancelled"]);

export function parseResolvePacket(body = {}) {
  const packetType = String(body.packet_type || body.type || "").trim();
  if (packetType && packetType !== RESOLVE_PACKET_TYPE) {
    return { ok: false, error: "not_a_resolve_packet", packet_type: packetType };
  }
  const payload = body.payload && typeof body.payload === "object" ? body.payload : body;
  const obligationId = String(
    payload.obligation_id || payload.continuation_id || "",
  ).trim();
  if (!obligationId) {
    return { ok: false, error: "resolve_requires_obligation_id" };
  }
  const stepResult = payload.step_result && typeof payload.step_result === "object"
    ? payload.step_result
    : null;
  return {
    ok: true,
    envelope: {
      id: String(body.id || payload.id || "").trim() || null,
      packet_type: RESOLVE_PACKET_TYPE,
      artifact_type: String(body.artifact_type || "cop/cognitive-packet"),
      sender: body.sender || {},
      recipient: body.recipient || {},
      trace: body.trace || {},
      created_at: body.created_at || null,
      payload: {
        schema: RESOLVE_PACKET_TYPE,
        obligation_id: obligationId,
        continuation_id: String(payload.continuation_id || obligationId).trim(),
        decision: String(payload.decision || inferDecision(stepResult) || "pending").trim(),
        step_result: stepResult,
        reason: payload.reason || stepResult?.reason || null,
        actor: payload.actor || null,
        authorized: false,
      },
    },
  };
}

export function applyContinuationResolve(db, body, context = {}) {
  const parsed = parseResolvePacket(body);
  if (!parsed.ok) throw new Error(parsed.error);
  const payload = parsed.envelope.payload;
  const existing = getCalendarObligation(db, payload.obligation_id);
  if (!existing) {
    throw new Error(`unknown_calendar_obligation:${payload.obligation_id}`);
  }
  if (!isContinuationObligation(existing)) {
    throw new Error("resolve_requires_continuation");
  }

  const now = context.now || parsed.envelope.created_at || new Date().toISOString();
  const alreadyClosed = existing.status === "closed";
  const closed = alreadyClosed || shouldClose(payload.decision, payload.step_result);
  const status = closed
    ? "closed"
    : (payload.decision === "hibernating" ? "paused" : existing.status);
  const evidence = {
    ok: true,
    pending: !closed,
    authorized: false,
    packet_kind: "continuation",
    kind: workKindFromObligation(existing) || "continuation",
    message: closed ? "continuation_resolved" : "continuation_awaits_judgment",
    decision: payload.decision,
    step_result: payload.step_result,
    reason: payload.reason,
    hitl: true,
  };

  appendCopEvent(db, {
    ...parsed.envelope,
    id: body.id || parsed.envelope.id || `cop:resolve:${payload.obligation_id}:${now}`,
    created_at: now,
    sender: body.sender || parsed.envelope.sender,
  }, { obligation_id: payload.obligation_id, now });

  if (closed && !alreadyClosed) {
    appendCopEvent(db, {
      id: `cop:close:${payload.obligation_id}:${now}`,
      packet_type: COP_CALENDAR_KINDS.CLOSE,
      created_at: now,
      payload: {
        schema: COP_CALENDAR_KINDS.CLOSE,
        obligation_id: payload.obligation_id,
        closed_at: now,
        reason: payload.reason || payload.decision,
      },
    }, { obligation_id: payload.obligation_id, now });
  }

  const stored = applyObligationStatus(db, payload.obligation_id, {
    now,
    closed,
    status,
    closed_at: closed ? now : existing.closed_at,
    evidence,
  });

  return {
    schema: "operium.calendar.resolve.v1",
    ok: true,
    authorized: false,
    packet_type: RESOLVE_PACKET_TYPE,
    closed,
    duplicate: alreadyClosed,
    obligation: stored,
    evidence,
  };
}

export function isContinuationObligation(obligation = {}) {
  const packetKind = String(
    obligation.config?.wake?.payload?.packet?.envelope?.packet_kind || "",
  ).trim();
  const workKind = workKindFromObligation(obligation);
  return packetKind === "continuation"
    || workKind === "continuation"
    || workKind.startsWith("continuation.");
}

function inferDecision(stepResult) {
  const status = String(stepResult?.status || "").trim();
  if (status === "success" || status === "failed") return "resolved";
  if (status === "cancelled") return "cancelled";
  if (status === "needs_acceptance") return "pending";
  return null;
}

export function resolveCloses(payload = {}) {
  if (String(payload.step_result?.status || "") === "needs_acceptance") return false;
  if (CLOSE_DECISIONS.has(String(payload.decision || ""))) return true;
  return CLOSE_STEP_STATUSES.has(String(payload.step_result?.status || ""));
}

function shouldClose(decision, stepResult) {
  return resolveCloses({ decision, step_result: stepResult });
}
