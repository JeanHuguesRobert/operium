/**
 * La Nasa control-room surface hosted inside ONA (ESM, no CGI / no curl).
 * Compat paths: /cgi-bin/* and modern /nasa/*
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  acceptAgentRestart,
  executeObservationRefresh,
} from "./soma-actions.js";
import { resolveOpsStateDir } from "./paths.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const FLEET_NODES = Object.freeze([
  { host: "fracta", resource_id: "resource://fracta", label: "Fracta" },
  { host: "fracta2", resource_id: "resource://fracta2", label: "Fracta 2" },
  { host: "i7-thinkpad-jhr", resource_id: "resource://i7-thinkpad-jhr", label: "Workstation" },
  { host: "rpi3-view", resource_id: "resource://rpi3-view", label: "Raspberry Pi view" },
  { host: "poco-jhr", resource_id: "resource://poco-jhr", label: "Phone" },
]);

const ALLOWED_ACTIONS = new Set(["observation.refresh", "agent.restart"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

/**
 * @returns {boolean} true if the request was handled
 */
export async function handleNasaPortal(req, res, url, deps = {}) {
  const config = deps.config;
  if (!config) return false;

  // Reading may be mesh-open, but state-changing operations need explicit
  // authority for this node.  Do not turn a Tailscale perimeter into admin.
  const canRead = Boolean(deps.hasReadAuth?.()) || config.bind === "127.0.0.1";
  const canAdmin = Boolean(deps.hasAdminAuth?.());

  const p = url.pathname;

  // --- JSON APIs (compat + modern) ---
  if (req.method === "GET" && (p === "/cgi-bin/fleet" || p === "/nasa/fleet")) {
    if (!canRead) return sendJson(res, 401, { ok: false, error: "unauthorized" });
    const body = await buildFleet(config);
    return sendJson(res, 200, body, { "Cache-Control": "no-store" });
  }

  if (req.method === "GET" && (p === "/cgi-bin/node" || p === "/nasa/node")) {
    if (!canRead) return sendJson(res, 401, { ok: false, error: "unauthorized" });
    const host = sanitizeHost(url.searchParams.get("host"));
    if (!host) return sendJson(res, 200, { ok: false, error: "missing_host" });
    if (!isKnownHost(host)) {
      return sendJson(res, 200, { ok: false, error: "unknown_host", host });
    }
    const pack = await buildNodePack(host, config, deps);
    return sendJson(res, 200, pack, { "Cache-Control": "no-store" });
  }

  if (
    req.method === "POST"
    && (p === "/cgi-bin/action" || p === "/nasa/action")
  ) {
    if (!canAdmin) return sendJson(res, 401, { ok: false, error: "unauthorized_admin" });
    const host = sanitizeHost(url.searchParams.get("host"));
    const name = sanitizeAction(url.searchParams.get("name"));
    if (!host || !name) {
      return sendJson(res, 200, { ok: false, error: "missing_host_or_name" });
    }
    if (!isKnownHost(host)) {
      return sendJson(res, 200, { ok: false, error: "unknown_host", host });
    }
    if (!ALLOWED_ACTIONS.has(name)) {
      return sendJson(res, 200, { ok: false, error: "action_not_allowed", name });
    }
    const result = await runNasaAction(host, name, config, deps);
    return sendJson(res, 200, result, { "Cache-Control": "no-store" });
  }

  if (req.method === "GET" && (p === "/cgi-bin/refresh" || p === "/nasa/refresh")) {
    if (!canRead) return sendJson(res, 401, { ok: false, error: "unauthorized" });
    const status = await writeStatusJson(config, deps);
    return sendJson(res, 200, status, { "Cache-Control": "no-store" });
  }

  if (req.method === "GET" && p === "/status.json") {
    if (!canRead) return sendJson(res, 401, { ok: false, error: "unauthorized" });
    const status = readStatusJson(deps) || await writeStatusJson(config, deps);
    return sendJson(res, 200, status, { "Cache-Control": "no-store" });
  }

  // Simple no-JS home (inline, no Python)
  if (req.method === "GET" && (p === "/cgi-bin/home" || p === "/nasa/home")) {
    if (!canRead) return sendJson(res, 401, { ok: false, error: "unauthorized" });
    const status = readStatusJson(deps) || await writeStatusJson(config, deps);
    return sendHtml(res, 200, renderHomeHtml(status));
  }

  // Static portal assets
  if (req.method === "GET") {
    const staticPath = resolveStaticPath(p, deps);
    if (staticPath) {
      if (!canRead) return sendJson(res, 401, { ok: false, error: "unauthorized" });
      return sendStaticFile(res, staticPath);
    }
  }

  return false;
}

export function resolveNasaStaticRoot(env = process.env) {
  const configured = String(env.ONA_NASA_STATIC || env.OPERIUM_EDGE_PORTAL_DIR || "").trim();
  if (configured) return path.resolve(configured);
  // package: lib/node-agent → apps/edge-portal
  return path.resolve(__dirname, "../../apps/edge-portal");
}

export function resolveNasaCacheDir(env = process.env) {
  const configured = String(env.ONA_NASA_CACHE_DIR || "").trim();
  if (configured) return path.resolve(configured);
  return path.join(resolveOpsStateDir(env), "nasa-cache", "nodes");
}

/**
 * Public, secret-free DNS configuration snapshot for the local NASA view.
 * This file is deliberately separate from provider credentials and is written
 * by an operator-controlled export/diff workflow, not by the web portal.
 */
export function resolveNasaDnsStatusPath(env = process.env) {
  const configured = String(env.ONA_NASA_DNS_STATUS_JSON || "").trim();
  if (configured) return path.resolve(configured);
  return path.join(resolveOpsStateDir(env), "nasa-cache", "dns-status.json");
}

function isKnownHost(host) {
  return FLEET_NODES.some((n) => n.host === host);
}

function sanitizeHost(value) {
  const s = String(value || "").trim();
  if (!/^[A-Za-z0-9._-]+$/.test(s)) return "";
  return s;
}

function sanitizeAction(value) {
  const s = String(value || "").trim();
  if (!/^[A-Za-z0-9._-]+$/.test(s)) return "";
  return s;
}

function isSelfHost(host, config) {
  const me = String(config.hostname || "").toLowerCase();
  return host === me || (me && host === me);
}

export async function resolvePeerBase(host, config) {
  const port = Number(config.port || 8794);
  if (isSelfHost(host, config)) {
    return `http://127.0.0.1:${port}`;
  }
  // Prefer MagicDNS short name
  const shortBase = `http://${host}:${port}`;
  if (await quickOk(`${shortBase}/health`, 2000)) return shortBase;

  const tip = await tailscaleIp4(host);
  if (tip) {
    const tipBase = `http://${tip}:${port}`;
    if (await quickOk(`${tipBase}/health`, 2000)) return tipBase;
  }
  return shortBase;
}

function abortAfter(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

async function quickOk(url, timeoutMs) {
  try {
    const r = await fetch(url, { signal: abortAfter(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}

async function tailscaleIp4(host) {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync("tailscale", ["ip", "-4", host], {
      timeout: 3000,
      windowsHide: true,
    });
    const ip = String(stdout || "").trim().split(/\s+/)[0];
    return ip || null;
  } catch {
    return null;
  }
}

async function fetchJson(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 8000);
  try {
    const r = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
      signal: abortAfter(timeoutMs),
    });
    const text = await r.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { ok: false, error: "invalid_json", raw: text.slice(0, 200) };
    }
    return { ok: r.ok, status: r.status, body, url };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { ok: false, error: error?.name === "TimeoutError" ? "timeout" : error.message },
      url,
    };
  }
}

export async function buildFleet(config) {
  const generated_at = new Date().toISOString();
  const nodes = [];
  for (const def of FLEET_NODES) {
    nodes.push(await probeFleetNode(def, config));
  }
  return {
    schema: "operium.edge-portal.fleet.v1",
    generated_at,
    mode: "mesh-pull",
    served_by: "ona-nasa-portal",
    observer: nasaObserver(config),
    view: {
      id: "local-fractanet",
      membership: "registered-tailnet-nodes",
    },
    dns: readNasaDnsStatus(),
    nodes,
  };
}

export function readNasaDnsStatus(env = process.env) {
  const file = resolveNasaDnsStatusPath(env);
  let source;
  try {
    source = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {
      schema: "operium.nasa.dns-view.v1",
      availability: "unavailable",
      reason: "no_public_snapshot",
      observed_at: null,
      domains: [],
    };
  }

  if (!source || source.schema !== "operium.nasa.dns-view.v1" || !Array.isArray(source.domains)) {
    return {
      schema: "operium.nasa.dns-view.v1",
      availability: "invalid",
      reason: "invalid_public_snapshot",
      observed_at: null,
      domains: [],
    };
  }

  const string = (value, max = 160) => typeof value === "string" ? value.slice(0, max) : null;
  const domains = source.domains.map((domain) => ({
    domain: string(domain?.domain, 253),
    migration_state: string(domain?.migration_state, 32),
    registrar: string(domain?.registrar),
    active_authoritative_dns: string(domain?.active_authoritative_dns),
    standby_dns: string(domain?.standby_dns),
    edge_mode: string(domain?.edge_mode, 64),
    dnssec_state: string(domain?.dnssec_state, 64),
  })).filter((domain) => domain.domain && /^[a-z0-9.-]+$/i.test(domain.domain));

  return {
    schema: "operium.nasa.dns-view.v1",
    availability: "available",
    observed_at: string(source.observed_at, 64),
    source: {
      kind: string(source.source?.kind, 64),
      reference: string(source.source?.reference, 240),
    },
    domains,
  };
}

async function probeFleetNode(def, config) {
  const base = await resolvePeerBase(def.host, config);
  const endpoint = `${base}/node/status`;
  const [r, mesh_reachable] = await Promise.all([
    fetchJson(endpoint, { timeoutMs: 5000 }),
    probeMeshReachability(def.host),
  ]);
  const st = r.ok ? r.body : null;
  return {
    host: def.host,
    resource_id: def.resource_id,
    label: isSelfHost(def.host, config) ? "This node" : def.label,
    online: Boolean(r.ok && st),
    http_status: r.status || 0,
    health_score: st?.health_score ?? null,
    mesh_reachable,
    hostname: st?.hostname ?? null,
    endpoint,
    base,
  };
}

async function probeMeshReachability(host) {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    await execFileAsync("tailscale", ["ping", "--c=1", host], {
      timeout: 3000,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

function nasaObserver(config) {
  const hostname = String(config?.hostname || "").trim() || null;
  const resource_id = String(config?.nodeId || "").trim() || (hostname ? `resource://${hostname}` : null);
  return { hostname, resource_id };
}

export async function buildNodePack(host, config, deps = {}) {
  const cacheDir = resolveNasaCacheDir(deps.env || process.env);
  const cacheFile = path.join(cacheDir, `${host}.json`);
  const base = await resolvePeerBase(host, config);
  const cached_at = new Date().toISOString();

  const statusR = await fetchJson(`${base}/node/status`, { timeoutMs: 5000 });
  if (!statusR.ok) {
    const cached = readCacheFile(cacheFile);
    if (cached) {
      return {
        ok: true,
        live: false,
        stale: true,
        host: cached.host || host,
        base: cached.base || base,
        cached_at: cached.cached_at || null,
        status: cached.status ?? null,
        object: cached.object ?? null,
        vocabulary: cached.vocabulary ?? null,
        observations: cached.observations ?? null,
        actions: cached.actions ?? null,
        calendar: cached.calendar ?? null,
        cache_schema: cached.schema || "operium.edge-portal.node-cache.v1",
        served_by: "ona-nasa-portal",
      };
    }
    return {
      ok: false,
      live: false,
      host,
      base,
      error: "unreachable",
      status_http: statusR.status || 0,
      served_by: "ona-nasa-portal",
    };
  }

  const [objectR, vocabR, obsR, actionsR, calendarR] = await Promise.all([
    fetchJson(`${base}/soma/object`, { timeoutMs: 5000 }),
    fetchJson(`${base}/soma/vocabulary`, { timeoutMs: 4000 }),
    fetchJson(`${base}/soma/observations`, { timeoutMs: 4000 }),
    fetchJson(`${base}/soma/actions`, { timeoutMs: 4000 }),
    fetchJson(`${base}/node/calendar`, { timeoutMs: 4000 }),
  ]);

  const pack = {
    ok: true,
    live: true,
    stale: false,
    host,
    base,
    cached_at,
    status: statusR.body,
    object: objectR.ok ? objectR.body : null,
    vocabulary: vocabR.ok ? vocabR.body : null,
    observations: obsR.ok ? obsR.body : null,
    actions: actionsR.ok ? actionsR.body : null,
    calendar: calendarR.ok ? calendarR.body : null,
    served_by: "ona-nasa-portal",
  };

  writeCacheFile(cacheFile, {
    schema: "operium.edge-portal.node-cache.v1",
    cached_at,
    host,
    base,
    status: pack.status,
    object: pack.object,
    vocabulary: pack.vocabulary,
    observations: pack.observations,
    actions: pack.actions,
    calendar: pack.calendar,
  });

  return pack;
}

async function runNasaAction(host, name, config, deps) {
  const base = await resolvePeerBase(host, config);

  // In-process for self (no HTTP hop)
  if (isSelfHost(host, config) && deps.db) {
    try {
      if (name === "observation.refresh" && typeof deps.runProbe === "function") {
        const result = await executeObservationRefresh({
          db: deps.db,
          nodeId: deps.getNodeId?.() || config.nodeId,
          incarnation: deps.incarnation || `ona:${config.hostname}:live`,
          runProbe: deps.runProbe,
        });
        return {
          ok: result.status >= 200 && result.status < 300,
          host,
          name,
          base,
          http_status: result.status,
          result: result.body,
          served_by: "ona-nasa-portal",
          mode: "in-process",
        };
      }
      if (name === "agent.restart") {
        const result = acceptAgentRestart({
          db: deps.db,
          nodeId: deps.getNodeId?.() || config.nodeId,
          incarnation: deps.incarnation || `ona:${config.hostname}:live`,
        });
        const requestRestart = deps.requestRestart || (() => process.exit(75));
        setTimeout(() => requestRestart(result.body), Number(deps.restartDelayMs || 250));
        return {
          ok: result.status >= 200 && result.status < 300,
          host,
          name,
          base,
          http_status: result.status,
          result: result.body,
          served_by: "ona-nasa-portal",
          mode: "in-process",
        };
      }
    } catch (error) {
      return {
        ok: false,
        host,
        name,
        base,
        http_status: 500,
        error: error?.code || "action_failed",
        message: error?.message || String(error),
        served_by: "ona-nasa-portal",
        mode: "in-process",
      };
    }
  }

  return {
    ok: false,
    host,
    name,
    base,
    http_status: 403,
    error: "remote_action_requires_target_admin_authority",
    served_by: "ona-nasa-portal",
    mode: "not_forwarded",
  };
}

function readCacheFile(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeCacheFile(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  } catch {
    // best-effort cache
  }
}

function statusJsonPath(deps = {}) {
  const env = deps.env || process.env;
  const configured = String(env.ONA_NASA_STATUS_JSON || "").trim();
  if (configured) return path.resolve(configured);
  return path.join(resolveOpsStateDir(env), "nasa-cache", "status.json");
}

function readStatusJson(deps) {
  try {
    const p = statusJsonPath(deps);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

async function writeStatusJson(config, deps) {
  const fleet = await buildFleet(config);
  const byHost = Object.fromEntries(fleet.nodes.map((n) => [n.host, n.online]));
  const status = {
    schema: "operium.edge-portal.status.v1",
    generated_at: fleet.generated_at,
    mode: "mesh-pull",
    served_by: "ona-nasa-portal",
    observer: fleet.observer,
    view: fleet.view,
    dns: fleet.dns,
    services: { views_store: null },
    nodes: {
      fracta: Boolean(byHost.fracta),
      fracta2: Boolean(byHost.fracta2),
      workstation: Boolean(byHost["i7-thinkpad-jhr"]),
      phone: Boolean(byHost["poco-jhr"]),
      rpi3_view: Boolean(byHost["rpi3-view"]),
    },
  };
  try {
    const p = statusJsonPath(deps);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(status, null, 2));
  } catch {
    // ignore
  }
  return status;
}

function resolveStaticPath(pathname, deps) {
  const root = resolveNasaStaticRoot(deps.env || process.env);
  let rel = pathname === "/" || pathname === "" ? "index.html" : pathname.replace(/^\//, "");
  // no path escape
  if (rel.includes("..") || path.isAbsolute(rel)) return null;
  // ignore cgi under static resolver (handled above)
  if (rel.startsWith("cgi-bin/") || rel.startsWith("nasa/")) return null;
  const full = path.join(root, rel);
  if (!full.startsWith(root)) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

function sendStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": body.length,
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=60",
  });
  res.end(body);
  return true;
}

function renderHomeHtml(status) {
  const n = status?.nodes || {};
  const flag = (v) => (v === true ? "OK" : v === false ? "down" : "?");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>La Nasa (ONA)</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui,sans-serif;margin:1.2rem;background:#0b1118;color:#e8eef5}
a{color:#73b7ff}.card{border:1px solid #26384a;padding:1rem;background:#121c27;margin:1rem 0}
.muted{color:#91a4b7;font-size:0.9rem}</style></head><body>
<h1>La Nasa · ONA</h1>
<p class="muted">No-JS home · served by operium-node-agent</p>
<div class="card"><h2>Network</h2>
<p>Fracta: ${flag(n.fracta)} · Workstation: ${flag(n.workstation)} · Phone: ${flag(n.phone)} · Pi: ${flag(n.rpi3_view)}</p>
<p class="muted">Snapshot ${status?.generated_at || "?"}</p>
<p><a href="/">Full UI</a> · <a href="/status.json">status.json</a> · <a href="/nasa/fleet">fleet</a></p>
</div></body></html>`;
}

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
  return true;
}

function sendHtml(res, status, html) {
  const payload = Buffer.from(html, "utf8");
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
  });
  res.end(payload);
  return true;
}
