import { appendCopEvent, COP_CALENDAR_KINDS, getCopEvent } from "./cop-events.js";

export const COP_PACKET_KIND = "cop/cognitive-packet";

export function packetIds(packet = {}) {
  const ids = [];
  const payloadId = String(packet?.payload?.id || "").trim();
  const envelopeId = String(packet?.envelope?.id || "").trim();
  if (payloadId) ids.push(payloadId);
  if (envelopeId && envelopeId !== payloadId) ids.push(envelopeId);
  return ids;
}

export function putCopPacket(db, packet, options = {}) {
  if (!packet || typeof packet !== "object") return [];
  const now = options.now || new Date().toISOString();
  const ids = packetIds(packet);
  for (const id of ids) {
    appendCopEvent(db, {
      id,
      packet_type: COP_PACKET_KIND,
      artifact_type: "cop/cognitive-packet",
      created_at: now,
      payload: {
        schema: COP_PACKET_KIND,
        packet,
      },
    }, { now });
  }
  return ids;
}

export function getCopPacket(db, ref) {
  const id = String(ref || "").trim();
  if (!id || !db) return null;
  const event = getCopEvent(db, id);
  if (!event) return null;
  if (event.kind === COP_PACKET_KIND) {
    const packet = event.envelope?.payload?.packet;
    return packet && typeof packet === "object" ? packet : null;
  }
  if (event.kind === COP_CALENDAR_KINDS.WAKE) {
    const packet = event.envelope?.payload?.packet;
    return packet && typeof packet === "object" ? packet : null;
  }
  return null;
}
