import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandHome, resolveCogentiaRoot } from "../paths.js";
import { resolveCatalogueNode } from "./catalogue.js";

const operiumRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const DEFAULT_ATTRACTOR_SCRIPT = "cogentia/scripts/ops/attractor-heartbeat.js";

function resolveSecretsDir(env = process.env) {
  const ops = expandHome(String(env.COGENTIA_OPS_STATE_DIR || "").trim());
  if (ops) {
    const base = path.basename(ops).toLowerCase();
    if (base === "var") {
      return path.join(path.dirname(ops), "secrets");
    }
    if (base === ".cogentia") {
      return path.join(ops, "secrets");
    }
  }
  const home = expandHome(String(env.HOME || env.USERPROFILE || "").trim()) || os.homedir();
  return path.join(home, ".cogentia", "secrets");
}

function catalogueSecretPaths(node, hints = []) {
  const secrets = Array.isArray(node?.secrets) ? node.secrets : [];
  const out = [];
  for (const hint of hints) {
    const key = String(hint || "").toLowerCase();
    for (const entry of secrets) {
      const id = String(entry?.id || "").toLowerCase();
      const note = String(entry?.note || "").toLowerCase();
      if (!entry?.stored_in) continue;
      if (id.includes(key) || note.includes(key)) {
        out.push(entry.stored_in);
      }
    }
  }
  return out;
}

/**
 * Build platform-independent scheduled jobs from catalogue + env.
 * @returns {Array<{ job_id: string, kind: string, interval_ms: number, enabled: boolean, config: object }>}
 */
export function resolveNodeJobs(options = {}) {
  const config = options.config;
  const env = options.env || config?.env || process.env;
  const catalogue = options.catalogue;
  const hostname = String(options.hostname || config?.hostname || "").trim().toLowerCase();
  const intervalMs = Number(options.intervalMs || config?.jobIntervalMs || 180_000);
  const jobs = [];

  const node = options.catalogueNode
    || (catalogue ? resolveCatalogueNode(catalogue, { env, hostname }) : null);

  if (parseJobList(env.ONA_JOBS)) {
    const allowlist = new Set(parseJobList(env.ONA_JOBS));
    return buildCatalogueJobs({ node, hostname, intervalMs, env }).filter(
      job => allowlist.has(job.job_id) || allowlist.has(job.kind),
    );
  }

  if (parseBooleanEnv(env.ONA_JOBS, true) === false) {
    return [];
  }

  jobs.push(...buildCatalogueJobs({ node, hostname, intervalMs, env }));

  const extra = parseExtraJobs(env.ONA_EXTRA_JOBS_JSON);
  for (const job of extra) {
    if (job?.job_id) jobs.push(normalizeJob(job, intervalMs));
  }

  return dedupeJobs(jobs);
}

function buildCatalogueJobs({ node, hostname, intervalMs, env }) {
  const jobs = [];
  if (!node) return jobs;

  const ona = node.operium_node_agent;
  if (ona) {
    const envFiles = uniqueFiles([
      ona.blackboard_env,
      ona.secrets_file,
      env.ONA_ATTRACTOR_ENV_FILE,
      env.ONA_HEARTBEAT_ENV_FILE,
      path.join(resolveSecretsDir(env), "ona-blackboard.env"),
      path.join(resolveSecretsDir(env), "ona-heartbeat.env"),
      path.join(os.homedir(), "srv", "cogentia", "secrets", "ona-heartbeat.env"),
    ]);
    if (envFiles.length || env.COGENTIA_BLACKBOARD_URL) {
      jobs.push({
        job_id: "heartbeat:operium-node",
        kind: "ona.heartbeat",
        interval_ms: intervalMs,
        enabled: true,
        config: { env_files: envFiles },
      });
    }
  }

  const gateway = node.agent_gateway;
  if (gateway?.heartbeat_script) {
    const envFiles = uniqueFiles([
      gateway.blackboard_env,
      gateway.secrets_file,
      env.AGENT_GATEWAY_ATTRACTOR_ENV_FILE,
      env.AGENT_GATEWAY_ENV_FILE,
    ]);
    jobs.push({
      job_id: "heartbeat:agent-gateway",
      kind: "script",
      interval_ms: intervalMs,
      enabled: fileExists(gateway.blackboard_env) || Boolean(env.COGENTIA_BLACKBOARD_URL),
      config: {
        script: gateway.heartbeat_script,
        env_files: envFiles,
        cwd: "cogentia",
      },
    });
  }

  const bb = node.blackboard;
  if (bb?.attractor_id || bb?.attractor_id_planned) {
    const secretsDir = resolveSecretsDir(env);
    const attractorEnv = path.join(secretsDir, `attractor-${hostname}.env`);
    const envFiles = uniqueFiles([
      bb.env_file,
      attractorEnv,
      ...catalogueSecretPaths(node, ["attractor", "blackboard-upsert", "retrieval"]),
      env.COGENTIA_ATTRACTOR_ENV_FILE,
      path.join(os.homedir(), "srv", "cogentia", "secrets", `attractor-${hostname}.env`),
    ]);
    jobs.push({
      job_id: "heartbeat:retrieval-inline",
      kind: "script",
      interval_ms: intervalMs,
      enabled: envFiles.some(fileExists),
      config: {
        script: bb.heartbeat_script || DEFAULT_ATTRACTOR_SCRIPT,
        env_files: envFiles,
        cwd: "cogentia",
      },
    });
  }

  return jobs;
}

function normalizeJob(raw, defaultIntervalMs) {
  return {
    job_id: String(raw.job_id).trim(),
    kind: String(raw.kind || "script").trim(),
    interval_ms: Number(raw.interval_ms || raw.intervalMs || defaultIntervalMs),
    enabled: raw.enabled !== false,
    config: raw.config && typeof raw.config === "object" ? raw.config : {},
  };
}

function dedupeJobs(jobs) {
  const seen = new Map();
  for (const job of jobs) {
    seen.set(job.job_id, job);
  }
  return [...seen.values()];
}

export function resolveScriptPath(scriptRef, env = process.env) {
  const ref = String(scriptRef || "").trim().replace(/\\/g, "/");
  if (!ref) return null;

  const absolute = path.resolve(expandHome(ref));
  if (fs.existsSync(absolute)) return absolute;

  const cogentiaRoot = resolveCogentiaRoot(env);
  const candidates = [];

  if (ref.startsWith("cogentia/") && cogentiaRoot) {
    candidates.push(path.join(path.dirname(cogentiaRoot), ref));
    candidates.push(path.join(cogentiaRoot, "..", ref.replace(/^cogentia\//, "")));
  }
  if (ref.startsWith("operium/")) {
    candidates.push(path.join(operiumRoot, ref.replace(/^operium\//, "")));
    if (cogentiaRoot) {
      candidates.push(path.join(path.dirname(cogentiaRoot), ref));
    }
  }
  if (cogentiaRoot) {
    candidates.push(path.join(cogentiaRoot, ref));
    candidates.push(path.join(cogentiaRoot, "scripts", "ops", path.basename(ref)));
  }
  candidates.push(path.join(operiumRoot, ref));

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

export function resolveJobCwd(cwdHint, env = process.env) {
  const hint = String(cwdHint || "").trim().toLowerCase();
  if (hint === "cogentia") return resolveCogentiaRoot(env);
  if (hint === "operium") return operiumRoot;
  if (cwdHint) {
    const resolved = path.resolve(expandHome(String(cwdHint)));
    if (fs.existsSync(resolved)) return resolved;
  }
  return resolveCogentiaRoot(env) || operiumRoot;
}

function uniqueFiles(files) {
  const seen = new Set();
  const out = [];
  for (const file of files) {
    if (!file) continue;
    const key = path.resolve(expandHome(String(file))).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(expandHome(String(file)));
  }
  return out;
}

function fileExists(filePath) {
  if (!filePath) return false;
  try {
    return fs.existsSync(path.resolve(expandHome(String(filePath))));
  } catch {
    return false;
  }
}

function parseJobList(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "1" || raw === "true") return null;
  if (raw === "0" || raw === "false") return [];
  return raw.split(/[,;]/).map(part => part.trim()).filter(Boolean);
}

function parseExtraJobs(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseBooleanEnv(value, fallback) {
  if (value == null || value === "") return fallback;
  const clean = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(clean)) return true;
  if (["0", "false", "no", "off"].includes(clean)) return false;
  return fallback;
}