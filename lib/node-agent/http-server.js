import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { buildNodeStatus } from "./status.js";
import { buildNodePeers } from "./peer-sync.js";
import { buildNodeLogs } from "./logs-route.js";
import { buildNodeDrift } from "./drift.js";
import { buildNodeSnapshot } from "./snapshot.js";
import { handleNodeProbe } from "./probe-route.js";
import { handleCopHttpRequest } from "./cop-handler.js";
import { readJsonBody } from "./http-body.js";
import { handleGraphRequest } from "./graph-routes.js";
import {
  buildSomaDescriptor,
  buildSomaObject,
  buildSomaObservations,
  buildSomaVocabulary,
} from "./soma.js";
import {
  acceptAgentRestart,
  buildSomaActions,
  buildSomaActionStatus,
  executeObservationRefresh,
} from "./soma-actions.js";
import { handleNasaPortal } from "./nasa-portal.js";
import { buildNodeCalendar } from "./calendar-view.js";
import { upsertDnsWatch } from "./calendar-store.js";
import { runDueCalendarObligations } from "./calendar-runner.js";

export function createOnaHttpServer(deps = {}) {
  const config = deps.config;
  const db = deps.db;
  const startedAt = deps.startedAt || new Date().toISOString();
  const getNodeId = deps.getNodeId || (() => config.nodeId);
  const graphDb = deps.graphDb;

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      const status = error.code === "invalid_json" ? 400 : 500;
      sendJson(res, status, {
        ok: false,
        error: error.code || "internal_error",
        message: error.message || null,
      });
    });
  });

  async function handleRequest(req, res) {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // CORS for mesh control-room UI (La Nasa / console) when mesh-open-read
    if (req.method === "OPTIONS") {
      if (config.meshOpenRead || config.healthPublic) {
        res.writeHead(204, corsHeaders());
        return res.end();
      }
    }

    if (url.pathname.startsWith("/graph/")) {
      if (!hasReadAuth(req, config) && config.bind !== "127.0.0.1") return sendJson(res, 401, { ok: false, error: "unauthorized" });
      if (handleGraphRequest(req, res, graphDb)) return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      const result = buildHealthResponse(req, config, startedAt, getNodeId());
      return sendJson(res, result.status, result.body);
    }

    if (req.method === "GET" && url.pathname === "/.well-known/soma") {
      if (!isHealthAllowed(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized" });
      }
      return sendJson(res, 200, buildSomaDescriptor({
        config,
        nodeId: getNodeId(),
      }));
    }

    if (req.method === "GET" && url.pathname === "/soma/vocabulary") {
      if (!isHealthAllowed(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized" });
      }
      return sendJson(res, 200, buildSomaVocabulary());
    }

    if (req.method === "GET" && url.pathname === "/soma/object") {
      if (!hasReadAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized" });
      }
      return sendJson(res, 200, buildSomaObject({
        config,
        db,
        startedAt,
        nodeId: getNodeId(),
      }));
    }

    if (req.method === "GET" && url.pathname === "/soma/observations") {
      if (!hasReadAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized" });
      }
      return sendJson(res, 200, buildSomaObservations({
        config,
        db,
        startedAt,
        nodeId: getNodeId(),
      }));
    }

    if (req.method === "GET" && url.pathname === "/soma/actions") {
      if (!hasReadAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized" });
      }
      return sendJson(res, 200, buildSomaActions(db));
    }

    if (req.method === "GET" && url.pathname.startsWith("/soma/actions/")) {
      if (!hasReadAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized" });
      }
      const actionId = decodeURIComponent(url.pathname.slice("/soma/actions/".length));
      const result = buildSomaActionStatus(db, actionId);
      return sendJson(res, result.status, result.body);
    }

    if (req.method === "POST" && url.pathname === "/soma/actions/observation.refresh") {
      if (!hasAdminAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized_admin" });
      }
      const result = await executeObservationRefresh({
        db,
        nodeId: getNodeId(),
        incarnation: deps.incarnation,
        runProbe: deps.runProbe,
      });
      return sendJson(res, result.status, result.body);
    }

    if (req.method === "POST" && url.pathname === "/soma/actions/agent.restart") {
      if (!hasAdminAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized_admin" });
      }
      const result = acceptAgentRestart({
        db,
        nodeId: getNodeId(),
        incarnation: deps.incarnation,
      });
      sendJson(res, result.status, result.body);
      const requestRestart = deps.requestRestart || (() => process.exit(75));
      setTimeout(() => requestRestart(result.body), Number(deps.restartDelayMs || 250));
      return;
    }

    if (req.method === "GET" && url.pathname === "/node/status") {
      if (!hasReadAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized" });
      }
      const body = buildNodeStatus({
        config,
        db,
        startedAt,
        nodeId: getNodeId(),
      });
      return sendJson(res, 200, body);
    }

    if (req.method === "GET" && url.pathname === "/node/peers") {
      if (!hasReadAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized" });
      }
      const freshOnly = parseFreshQuery(url.searchParams.get("fresh"));
      const body = buildNodePeers({
        config,
        db,
        nodeId: getNodeId(),
        fresh: freshOnly,
      });
      return sendJson(res, 200, body);
    }

    if (req.method === "GET" && url.pathname === "/node/snapshot") {
      if (!hasReadAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized" });
      }
      const body = buildNodeSnapshot({
        config,
        db,
        startedAt,
        nodeId: getNodeId(),
      });
      return sendJson(res, 200, body);
    }

    if (req.method === "GET" && url.pathname === "/node/drift") {
      if (!hasReadAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized" });
      }
      const body = buildNodeDrift({
        config,
        db,
        nodeId: getNodeId(),
      });
      return sendJson(res, 200, body);
    }

    if (req.method === "GET" && url.pathname === "/node/calendar") {
      if (!hasReadAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized" });
      }
      const body = buildNodeCalendar({
        config,
        db,
        nodeId: getNodeId(),
        service: url.searchParams.get("service") || undefined,
        project: url.searchParams.get("project") || undefined,
        status: url.searchParams.get("status") || undefined,
        kind: url.searchParams.get("kind") || undefined,
      });
      return sendJson(res, 200, body);
    }

    if (req.method === "POST" && url.pathname === "/node/calendar/watch") {
      if (!hasAdminAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized_admin" });
      }
      const payload = await readJsonBody(req);
      const stored = upsertDnsWatch(db, payload, {
        node_id: getNodeId(),
        hostname: config.hostname,
      });
      return sendJson(res, 200, {
        ok: true,
        authorized: false,
        obligation: stored,
      });
    }

    if (req.method === "POST" && url.pathname === "/node/calendar/tick") {
      if (!hasAdminAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized_admin" });
      }
      const result = await runDueCalendarObligations(db);
      return sendJson(res, 200, result);
    }

    if (req.method === "GET" && url.pathname === "/node/logs") {
      if (!hasReadAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized" });
      }
      const body = buildNodeLogs({
        config,
        db,
        nodeId: getNodeId(),
      }, url.searchParams);
      return sendJson(res, 200, body);
    }

    if (req.method === "POST" && url.pathname === "/node/probe") {
      if (!hasAdminAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized_admin" });
      }
      const result = await handleNodeProbe({
        config,
        db,
        nodeId: getNodeId(),
        runProbe: deps.runProbe,
      });
      return sendJson(res, result.status, result.body);
    }

    if (req.method === "POST" && url.pathname === "/node/cop") {
      if (!hasCopAuth(req, config)) {
        return sendJson(res, 401, { ok: false, error: "unauthorized_cop" });
      }
      const body = await readJsonBody(req);
      const result = await handleCopHttpRequest(body, {
        config,
        db,
        startedAt,
        nodeId: getNodeId(),
      });
      return sendJson(res, result.status, result.body);
    }

    // La Nasa desk (static + fleet/node/action) — ESM in-process, no CGI
    if (await handleNasaPortal(req, res, url, {
      config,
      db,
      startedAt,
      getNodeId,
      incarnation: deps.incarnation,
      runProbe: deps.runProbe,
      requestRestart: deps.requestRestart,
      restartDelayMs: deps.restartDelayMs,
      hasReadAuth: () => hasReadAuth(req, config),
      hasAdminAuth: () => hasAdminAuth(req, config),
      env: process.env,
    })) {
      return;
    }

    return sendJson(res, 404, { ok: false, error: "not_found" });
  }

  return server;
}

function buildHealthResponse(req, config, startedAt, nodeId) {
  if (!isHealthAllowed(req, config)) {
    return { status: 401, body: { ok: false, error: "unauthorized" } };
  }

  const uptimeSeconds = Math.floor((Date.now() - Date.parse(startedAt)) / 1000);
  return {
    status: 200,
    body: {
      ok: true,
      service: "operium-node-agent",
      version: config.version,
      node_id: nodeId,
      hostname: config.hostname,
      uptime_seconds: uptimeSeconds,
      bind: config.bind,
      port: config.port,
      mesh_open_read: config.meshOpenRead,
    },
  };
}

function isHealthAllowed(req, config) {
  if (config.healthPublic || config.bind === "127.0.0.1") return true;
  return hasReadAuth(req, config) || hasAdminAuth(req, config);
}

function hasReadAuth(req, config) {
  // Mesh-open read: trust Tailscale perimeter (see docs/control-room-mib-lite-v0.md).
  if (config.meshOpenRead) return true;
  return hasBearerToken(req, config.tokens.read)
    || hasBearerToken(req, config.tokens.admin);
}

function hasAdminAuth(req, config) {
  // Administrative authority is always node-local and explicit.  Mesh-open
  // controls visibility of read surfaces; it must never imply action rights.
  return hasBearerToken(req, config.tokens.admin);
}

function hasCopAuth(req, config) {
  return hasBearerToken(req, config.tokens.peer)
    || hasBearerToken(req, config.tokens.admin);
}

function hasBearerToken(req, expected) {
  if (!expected) return false;
  const authorization = String(req.headers?.authorization || "");
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  const supplied = bearer || String(req.headers?.["x-ona-token"] || "");
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function parseFreshQuery(value) {
  if (value == null || value === "") return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Ona-Token",
    "Access-Control-Max-Age": "86400",
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...corsHeaders(),
  });
  res.end(payload);
}

export function startOnaHttpServer(server, config) {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(config.port, config.bind, () => {
      resolve({
        url: `http://${config.bind}:${config.port}`,
      });
    });
  });
}
