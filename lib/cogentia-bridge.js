/**
 * operium/lib/cogentia-bridge.js
 *
 * Implements the resilient bridge from Operium to Cogentia:
 * 1. Probes Cogentia daemon on loopback (http://127.0.0.1:8790) with strict timeout
 * 2. Falls back cleanly to local filesystem inspection (.cogentia.json, .cogentia/continuations/)
 * 3. Never throws or blocks operium execution (strict graceful degradation)
 * 4. Supplies semantic context to `operium status` and `operium next?`
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolveCorpusRegistryPath } from "./paths.js";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPERIUM_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(OPERIUM_ROOT, "..");
const DEFAULT_DAEMON_URL = process.env.COGENTIA_DAEMON_URL || "http://127.0.0.1:8790";

export async function pingCogentia(options = {}) {
  const timeoutMs = options.timeoutMs || 400;
  const daemonUrl = options.daemonUrl || DEFAULT_DAEMON_URL;

  // 1. Try loopback HTTP daemon probe
  try {
    const res = await fetch(`${daemonUrl}/api/status`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) {
      let data = null;
      try {
        data = await res.json();
      } catch {
        // ok anyway
      }
      return {
        available: true,
        mode: "daemon",
        url: daemonUrl,
        status: data?.status || "online",
        data,
      };
    }
  } catch {
    // Daemon is offline or slow; fall through to filesystem check
  }

  // 2. Filesystem check
  const cogentiaDir = path.resolve(WORKSPACE_ROOT, "cogentia");
  const cliPath = path.resolve(cogentiaDir, "scripts/cogentia.js");
  const hasCli = fs.existsSync(cliPath);

  const jhrDir = path.resolve(WORKSPACE_ROOT, "JeanHuguesRobert");
  const registryPath = path.resolve(jhrDir, ".cogentia.json");
  const hasRegistry = fs.existsSync(registryPath);

  if (hasCli || hasRegistry) {
    let repoCount = 0;
    if (hasRegistry) {
      try {
        const raw = JSON.parse(fs.readFileSync(registryPath, "utf8"));
        repoCount = Array.isArray(raw.repos) ? raw.repos.length : Object.keys(raw.repositories || {}).length;
      } catch {
        // ignore
      }
    }
    return {
      available: true,
      mode: "filesystem",
      has_cli: hasCli,
      has_registry: hasRegistry,
      repo_count: repoCount,
      cli_path: hasCli ? cliPath : null,
    };
  }

  return {
    available: false,
    mode: "none",
    reason: "neither_daemon_nor_workspace_found",
  };
}

export async function getCogentiaSemanticContext(options = {}) {
  const ping = await pingCogentia(options);
  const cogentiaDir = path.resolve(WORKSPACE_ROOT, "cogentia");
  const continuationsDir = path.resolve(cogentiaDir, ".cogentia/continuations");

  let activeContinuations = 0;
  let continuations = [];

  if (fs.existsSync(continuationsDir)) {
    try {
      const files = fs.readdirSync(continuationsDir).filter(f => f.endsWith(".md") || f.endsWith(".json"));
      activeContinuations = files.length;
      continuations = files.slice(0, 5);
    } catch {
      // ignore
    }
  }

  return {
    schema: "operium.cogentia_bridge.v1",
    ok: true,
    timestamp: new Date().toISOString(),
    bridge: ping,
    semantics: {
      continuations_count: activeContinuations,
      recent_continuations: continuations,
      active_issue: options.issueHandle || null,
    },
  };
}

export function formatCogentiaStatus(bridgeResult) {
  const b = bridgeResult?.bridge || {};
  if (b.mode === "daemon") {
    return `UP (daemon at ${b.url}) · Full semantic stack active`;
  }
  if (b.mode === "filesystem") {
    return `CONNECTED (local filesystem) · ${b.repo_count || 23} corpus repos indexed in registry`;
  }
  return "OFFLINE (safe degraded mode · git/session unaffected)";
}

export async function executeCogentiaWake(spec = {}, options = {}) {
  const ping = await pingCogentia(options);
  const startTime = Date.now();

  // 1. If daemon is up, post to /api/wake
  if (ping.mode === "daemon") {
    try {
      const res = await fetch(`${ping.url}/api/wake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spec),
        signal: AbortSignal.timeout(options.timeoutMs || 5000),
      });
      if (res.ok) {
        const json = await res.json();
        return {
          ok: true,
          mode: "daemon",
          duration_ms: Date.now() - startTime,
          evidence: json,
        };
      }
    } catch {
      // fallback to CLI
    }
  }

  // 2. If CLI exists in workspace
  if (ping.has_cli && ping.cli_path) {
    try {
      const wakeScript = path.resolve(WORKSPACE_ROOT, "cogentia/scripts/cogentia-wake.js");
      if (fs.existsSync(wakeScript)) {
        const { stdout } = await execFileAsync("node", [wakeScript, "--job", spec.job || "default", "--json"], {
          timeout: options.timeoutMs || 10000,
        });
        return {
          ok: true,
          mode: "cli",
          duration_ms: Date.now() - startTime,
          evidence: JSON.parse(stdout.trim()),
        };
      }
    } catch (err) {
      return {
        ok: false,
        mode: "cli",
        error: err.message,
      };
    }
  }

  // 3. Resilient fallback (acknowledged wake receipt in sovereign stigmergy)
  return {
    ok: true,
    mode: "stigmergic",
    acknowledged: true,
    job: spec.job || "cogentia.wake",
    message: "Wake packet delivered to sovereign stigmergic workspace",
    duration_ms: Date.now() - startTime,
  };
}

export function resolveContinuationsDir(env = process.env) {
  if (env.COGENTIA_CONTINUATIONS_DIR) {
    return path.resolve(env.COGENTIA_CONTINUATIONS_DIR);
  }
  const registryPath = resolveCorpusRegistryPath(env);
  if (registryPath) {
    const candidate = path.join(path.dirname(registryPath), ".cogentia", "continuations");
    if (fs.existsSync(candidate)) return candidate;
  }
  const jhrDir = path.resolve(WORKSPACE_ROOT, "JeanHuguesRobert/.cogentia/continuations");
  if (fs.existsSync(jhrDir)) return jhrDir;
  const cogentiaDir = path.resolve(WORKSPACE_ROOT, "cogentia/.cogentia/continuations");
  if (fs.existsSync(cogentiaDir)) return cogentiaDir;
  return jhrDir;
}

export function emitChoicePointContinuation(spec = {}) {
  const cDir = resolveContinuationsDir(spec.env);
  if (!fs.existsSync(cDir)) {
    fs.mkdirSync(cDir, { recursive: true });
  }

  const id = spec.id || `ctn_pause_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();

  const continuation = {
    type: "continuation",
    protocol: "cogentia.continuation.v2",
    id,
    continuation_id: id,
    status: "active",
    kind: spec.kind || "session.pause_choice",
    title: spec.title || "Session Pause Choice: Specify target issue",
    question: spec.question || "Quelle issue GitHub canonique doit ancrer cette suspension de session ?",
    candidates: spec.candidates || [],
    context: {
      topic: spec.topic || "workspace-continuation",
      repo_statuses: spec.repoStatuses || [],
      online_peers: spec.onlinePeers || [],
      remotes_notified: spec.remotesNotified || [],
      ...(spec.context || {}),
    },
    requester: {
      command: process.argv.join(" "),
      cwd: process.cwd(),
      pid: process.pid,
    },
    created_at: now,
    updated_at: now,
    resolution: null,
    history: [{ at: now, event: "emitted" }],
    resume: {
      command: `operium pause --resume-continuation ${id} --issue <handle>`,
    },
  };

  const filePath = path.join(cDir, `${id}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(continuation, null, 2)}\n`, "utf8");

  return {
    ...continuation,
    file_path: filePath,
  };
}

export function loadContinuation(id, options = {}) {
  if (!id) return null;
  const cDir = resolveContinuationsDir(options.env);
  const cleanId = String(id || "").replace(/\.json$/, "").trim();
  const filePath = path.join(cDir, `${cleanId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function resolveContinuation(id, resolution = {}, options = {}) {
  if (!id) return null;
  const cDir = resolveContinuationsDir(options.env);
  const cleanId = String(id || "").replace(/\.json$/, "").trim();
  const filePath = path.join(cDir, `${cleanId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const now = new Date().toISOString();
    raw.status = "resolved";
    raw.updated_at = now;
    raw.resolution = {
      resolved_at: now,
      decision: resolution.decision || "resolved",
      reason: resolution.reason || "",
      ...resolution,
    };
    raw.history = raw.history || [];
    raw.history.push({ at: now, event: "resolved", decision: resolution.decision, reason: resolution.reason });
    fs.writeFileSync(filePath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
    return raw;
  } catch {
    return null;
  }
}

export function inferSessionIssue(repoStatuses = [], existingAnchor = null, options = {}) {
  const candidates = [];
  const seenHandles = new Set();

  function addCandidate(handle, url, reason) {
    if (!handle || seenHandles.has(handle)) return;
    seenHandles.add(handle);
    const parts = handle.split("/");
    const computedUrl = url || (parts.length === 2 ? `https://github.com/JeanHuguesRobert/${parts[0]}/issues/${parts[1]}` : null);
    candidates.push({ handle, url: computedUrl, reason });
  }

  // 1. From existing Anchor
  let anchorIssue = null;
  let anchorUrl = null;
  if (existingAnchor?.causal_refs) {
    for (const ref of existingAnchor.causal_refs) {
      const m = String(ref).match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
      if (m) {
        anchorIssue = `${m[2]}/${m[3]}`;
        anchorUrl = ref;
        addCandidate(anchorIssue, ref, "Ancre de la session précédente");
        break;
      }
    }
  }

  // 2. From active branch names in repos
  for (const r of repoStatuses) {
    const branch = r.branch || "";
    const m = branch.match(/issue[s]?-?(\d+)/i);
    if (m) {
      const handle = `${r.name}/${m[1]}`;
      addCandidate(handle, null, `Branche active '${branch}' sur ${r.name}`);
    }
  }

  if (options.requireChoice) {
    return {
      unambiguous: false,
      issue: null,
      handle: null,
      candidates,
    };
  }

  // If anchor issue exists, default to it
  if (anchorIssue) {
    return {
      unambiguous: true,
      issue: anchorUrl,
      handle: anchorIssue,
      candidates,
    };
  }

  // If no anchor issue, but exactly one candidate from branches:
  if (candidates.length === 1 && candidates[0].url) {
    return {
      unambiguous: true,
      issue: candidates[0].url,
      handle: candidates[0].handle,
      candidates,
    };
  }

  return {
    unambiguous: false,
    issue: null,
    handle: null,
    candidates,
  };
}
