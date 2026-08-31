import { dnsWatchObligation, normalizeObligation } from "./calendar.js";

export const WAKE_PACKET_TYPE = "cop/node.wake.v1";

export function parseWakePacket(body = {}) {
  const packetType = String(body.packet_type || body.type || "").trim();
  if (packetType && packetType !== WAKE_PACKET_TYPE) {
    return { ok: false, error: "not_a_wake_packet", packet_type: packetType };
  }
  const payload = body.payload && typeof body.payload === "object" ? body.payload : body;
  const packet = payload.packet && typeof payload.packet === "object" ? payload.packet : null;
  if (!packet?.payload && !payload.packet_ref) {
    return { ok: false, error: "wake_requires_packet_or_packet_ref" };
  }
  return {
    ok: true,
    envelope: {
      id: String(body.id || payload.id || "").trim() || null,
      packet_type: WAKE_PACKET_TYPE,
      artifact_type: String(body.artifact_type || "cop/cognitive-packet"),
      sender: body.sender || {},
      recipient: body.recipient || {},
      trace: body.trace || {},
      created_at: body.created_at || null,
      payload: {
        schema: WAKE_PACKET_TYPE,
        due_at: payload.due_at || null,
        deadline: payload.deadline || null,
        cadence: payload.cadence || payload.cadence_or_trigger || null,
        stop_condition: payload.stop_condition || null,
        escalation_policy: payload.escalation_policy || null,
        authorized: false,
        packet,
        packet_ref: payload.packet_ref || null,
      },
    },
  };
}

export function obligationFromWakePacket(body, context = {}) {
  const parsed = parseWakePacket(body);
  if (!parsed.ok) throw new Error(parsed.error);
  const wake = parsed.envelope;
  const work = wake.payload.packet?.payload || {};
  const envelope = wake.payload.packet?.envelope || {};
  const workKind = String(work.kind || envelope.packet_kind || "observation");
  const id = String(
    wake.id
    || work.id
    || (work.kind && work.domain ? `${work.kind}:${work.domain}` : "")
    || "",
  ).replace(/^cop:wake:/, "");

  return normalizeObligation({
    id: id || `wake:${Date.now()}`,
    kind: workKind,
    status: envelope.status || "active",
    owner_or_mandate: work.owner_or_mandate || "observation-only",
    scope: work.scope || envelope.scope || "project",
    target_node: work.target_node || context.node_id || null,
    service: work.service || inferService(workKind),
    project: work.project || work.domain || context.hostname || null,
    earliest_at: wake.payload.due_at,
    next_run_at: wake.payload.due_at,
    cadence_or_trigger: wake.payload.cadence,
    deadline: wake.payload.deadline,
    stop_condition: wake.payload.stop_condition || work.stop_condition,
    escalation_policy: wake.payload.escalation_policy,
    source_of_truth: `cop/node.wake.v1:${wake.id || id}`,
    calendar_origin: "wake",
    executes: true,
    config: {
      wake,
      ...work,
    },
  }, context);
}

export function dnsObservationWakePacket(spec = {}, context = {}) {
  const obligation = dnsWatchObligation(spec, context);
  return {
    id: `cop:wake:${obligation.id}`,
    packet_type: WAKE_PACKET_TYPE,
    artifact_type: "cop/cognitive-packet",
    created_at: spec.now || new Date().toISOString(),
    payload: {
      schema: WAKE_PACKET_TYPE,
      due_at: obligation.earliest_at,
      deadline: obligation.deadline,
      cadence: obligation.cadence_or_trigger,
      stop_condition: obligation.stop_condition,
      escalation_policy: obligation.escalation_policy,
      authorized: false,
      packet: {
        envelope: {
          packet_kind: "observation",
          transmission_mode: "copy",
          status: "active",
        },
        payload: {
          kind: "observation.dns.delegation",
          domain: obligation.config.domain,
          expected_ns: obligation.config.expected_ns,
          doh_url: obligation.config.doh_url,
        },
      },
    },
  };
}

export function continuationWakePacket(spec = {}, context = {}) {
  const id = String(spec.id || "continuation:pending").trim();
  const now = spec.now || new Date().toISOString();
  return {
    id: `cop:wake:${id}`,
    packet_type: WAKE_PACKET_TYPE,
    artifact_type: "cop/cognitive-packet",
    created_at: now,
    payload: {
      schema: WAKE_PACKET_TYPE,
      due_at: spec.due_at || now,
      deadline: spec.deadline || null,
      cadence: spec.cadence || { kind: "once" },
      stop_condition: spec.stop_condition || { type: "none" },
      escalation_policy: spec.escalation_policy || null,
      authorized: false,
      packet: {
        envelope: {
          packet_kind: "continuation",
          transmission_mode: "copy",
          status: "active",
        },
        payload: {
          kind: spec.kind || "continuation.judgment",
          id,
          question: spec.question || null,
          owner_or_mandate: spec.owner_or_mandate || "observation-only",
          project: spec.project || context.hostname || null,
        },
      },
    },
  };
}

export function workKindFromObligation(obligation = {}) {
  const fromPacket = obligation.config?.wake?.payload?.packet?.payload?.kind
    || obligation.config?.kind
    || obligation.kind;
  return String(fromPacket || "");
}

function inferService(workKind) {
  const kind = String(workKind || "").toLowerCase();
  if (kind.includes("dns")) return "dns";
  if (kind.startsWith("observation.")) return kind.split(".")[1] || "observation";
  if (kind === "continuation") return "continuation";
  return kind.split(".")[0] || "operium";
}
