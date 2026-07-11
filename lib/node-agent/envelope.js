import { randomUUID } from "node:crypto";

export const COP_NODE_PACKETS = {
  STATUS: "cop/node.status.v1",
  QUERY: "cop/node.query.v1",
  EVENT: "cop/node.event.v1",
  SNAPSHOT: "cop/node.snapshot.v1",
  PROBE: "cop/node.probe.v1",
  CONSOLIDATE: "cop/node.consolidate.v1",
};

export const COP_STUB_PACKETS = new Set([
  COP_NODE_PACKETS.PROBE,
  COP_NODE_PACKETS.CONSOLIDATE,
]);

export function parseCopEnvelope(body = {}) {
  const packetType = String(body.packet_type || body.type || "").trim();
  const id = String(body.id || body.event_id || `cop:${randomUUID()}`).trim();
  if (!packetType) {
    return { ok: false, error: "missing_packet_type" };
  }

  const sender = normalizeParty(body.sender || body.from || {});
  const recipient = normalizeParty(body.recipient || body.to || {});

  return {
    ok: true,
    envelope: {
      id,
      packet_type: packetType,
      sender,
      recipient,
      payload: body.payload && typeof body.payload === "object" ? body.payload : {},
      trace: body.trace && typeof body.trace === "object" ? body.trace : {},
      artifact_type: String(body.artifact_type || "cop/cognitive-packet").trim(),
      created_at: String(body.created_at || new Date().toISOString()),
    },
  };
}

export function buildCopResponseEnvelope(request, payload, options = {}) {
  return {
    id: `cop:${randomUUID()}`,
    packet_type: request.packet_type,
    artifact_type: request.artifact_type || "cop/cognitive-packet",
    sender: {
      node_id: options.nodeId || null,
      hostname: options.hostname || null,
    },
    recipient: request.sender,
    payload,
    trace: {
      ...(request.trace || {}),
      in_reply_to: request.id,
      correlation_id: request.trace?.correlation_id || request.id,
    },
    created_at: new Date().toISOString(),
  };
}

export function buildCopErrorEnvelope(request, error, options = {}) {
  return buildCopResponseEnvelope(request, {
    ok: false,
    schema: "cop/node.error.v1",
    error,
    message: options.message || null,
  }, options);
}

function normalizeParty(party = {}) {
  return {
    node_id: String(party.node_id || party.resource_id || "").trim() || null,
    hostname: String(party.hostname || "").trim() || null,
    attractor_id: String(party.attractor_id || "").trim() || null,
  };
}