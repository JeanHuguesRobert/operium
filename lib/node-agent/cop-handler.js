import { appendEventLog } from "./db.js";
import { listEventLog } from "./event-log.js";
import { listPeerNodes } from "./peer-sync.js";
import { buildNodeStatus } from "./status.js";
import { buildNodeSnapshot } from "./snapshot.js";
import { readLatestProbes } from "./local-state.js";
import {
  buildCopErrorEnvelope,
  buildCopResponseEnvelope,
  COP_NODE_PACKETS,
  COP_STUB_PACKETS,
  parseCopEnvelope,
} from "./envelope.js";
import { inboxExists, recordCopInbox } from "./cop-store.js";

export async function handleCopHttpRequest(body, deps = {}) {
  const parsed = parseCopEnvelope(body);
  if (!parsed.ok) {
    return { status: 400, body: { ok: false, error: parsed.error } };
  }

  const envelope = parsed.envelope;
  if (inboxExists(deps.db, envelope.id)) {
    return {
      status: 200,
      body: {
        ok: true,
        duplicate: true,
        packet_type: envelope.packet_type,
        envelope_id: envelope.id,
      },
    };
  }

  if (COP_STUB_PACKETS.has(envelope.packet_type)) {
    const response = buildCopErrorEnvelope(envelope, "not_implemented_v1", {
      nodeId: deps.nodeId,
      hostname: deps.config?.hostname,
      message: `${envelope.packet_type} deferred to Phase 3`,
    });
    recordCopInbox(deps.db, envelope, {
      handlerResult: { ok: false, stub: true },
    });
    return {
      status: 501,
      body: {
        ok: false,
        error: "not_implemented_v1",
        packet_type: envelope.packet_type,
        response_envelope: response,
      },
    };
  }

  const handler = HANDLERS[envelope.packet_type];
  if (!handler) {
    recordCopInbox(deps.db, envelope, {
      handlerResult: { ok: false, error: "unknown_packet_type" },
    });
    return {
      status: 400,
      body: {
        ok: false,
        error: "unknown_packet_type",
        packet_type: envelope.packet_type,
      },
    };
  }

  const result = await handler(envelope, deps);
  recordCopInbox(deps.db, envelope, {
    handlerResult: { ok: result.ok !== false, handler: result.handler },
  });

  if (envelope.packet_type === COP_NODE_PACKETS.EVENT) {
    return {
      status: 202,
      body: {
        ok: true,
        accepted: true,
        packet_type: envelope.packet_type,
        envelope_id: envelope.id,
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      packet_type: envelope.packet_type,
      handler: result.handler,
      response_envelope: result.response_envelope,
    },
  };
}

const HANDLERS = {
  [COP_NODE_PACKETS.STATUS]: handleStatusPacket,
  [COP_NODE_PACKETS.QUERY]: handleQueryPacket,
  [COP_NODE_PACKETS.EVENT]: handleEventPacket,
  [COP_NODE_PACKETS.SNAPSHOT]: handleSnapshotPacket,
};

function handleStatusPacket(envelope, deps) {
  const status = buildNodeStatus({
    config: deps.config,
    db: deps.db,
    startedAt: deps.startedAt,
    nodeId: deps.nodeId,
  });
  return {
    ok: true,
    handler: "status",
    response_envelope: buildCopResponseEnvelope(envelope, status, {
      nodeId: deps.nodeId,
      hostname: deps.config?.hostname,
    }),
  };
}

function handleQueryPacket(envelope, deps) {
  const payload = envelope.payload || {};
  const query = String(payload.query || "peers").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(payload.limit || 20), 1), 100);

  let data;
  if (query === "peers") {
    data = {
      query,
      peers: listPeerNodes(deps.db, { fresh: payload.fresh === true }),
    };
  } else if (query === "probe_history") {
    data = {
      query,
      probes: readLatestProbes(deps.db, limit),
    };
  } else if (query === "event_log") {
    data = {
      query,
      events: listEventLog(deps.db, {
        kind: payload.kind,
        limit,
        since: payload.since,
      }),
    };
  } else {
    return {
      ok: false,
      handler: "query",
      response_envelope: buildCopErrorEnvelope(envelope, "unknown_query", {
        nodeId: deps.nodeId,
        hostname: deps.config?.hostname,
        message: `Unsupported query: ${query}`,
      }),
    };
  }

  return {
    ok: true,
    handler: "query",
    response_envelope: buildCopResponseEnvelope(envelope, {
      ok: true,
      schema: "cop/node.query.result.v1",
      ...data,
      generated_at: new Date().toISOString(),
    }, {
      nodeId: deps.nodeId,
      hostname: deps.config?.hostname,
    }),
  };
}

function handleSnapshotPacket(envelope, deps) {
  const snapshot = buildNodeSnapshot({
    config: deps.config,
    db: deps.db,
    startedAt: deps.startedAt,
    nodeId: deps.nodeId,
  });
  return {
    ok: true,
    handler: "snapshot",
    response_envelope: buildCopResponseEnvelope(envelope, snapshot, {
      nodeId: deps.nodeId,
      hostname: deps.config?.hostname,
    }),
  };
}

function handleEventPacket(envelope, deps) {
  const payload = envelope.payload || {};
  const kind = String(payload.kind || "cop/node.event.v1").trim();
  appendEventLog(deps.db, kind, {
    source_node_id: envelope.sender?.node_id || null,
    detail: payload.detail || payload,
    cop_envelope_id: envelope.id,
  });
  return { ok: true, handler: "event" };
}
