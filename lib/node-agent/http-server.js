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

export function createOnaHttpServer(deps = {}) {
  const config = deps.config;
  const db = deps.db;
  const startedAt = deps.startedAt || new Date().toISOString();
  const getNodeId = deps.getNodeId || (() => config.nodeId);

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

    if (req.method === "GET" && url.pathname === "/health") {
      const result = buildHealthResponse(req, config, startedAt, getNodeId());
      return sendJson(res, result.status, result.body);
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
    },
  };
}

function isHealthAllowed(req, config) {
  if (config.healthPublic || config.bind === "127.0.0.1") return true;
  return hasReadAuth(req, config) || hasAdminAuth(req, config);
}

function hasReadAuth(req, config) {
  return hasBearerToken(req, config.tokens.read)
    || hasBearerToken(req, config.tokens.admin);
}

function hasAdminAuth(req, config) {
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

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
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