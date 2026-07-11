import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Resolve ops state directory — mirrors cogentia blackboard precedence:
 * COGENTIA_OPS_STATE_DIR → platform user default.
 */
export function resolveOpsStateDir(env = process.env) {
  const configured = String(env.COGENTIA_OPS_STATE_DIR || "").trim();
  if (configured) return path.resolve(configured);

  if (process.platform === "win32") {
    return path.join(os.homedir(), ".cogentia", "var");
  }

  if (process.getuid?.() === 0) {
    return "/var/lib/cogentia/.ops";
  }

  return path.join(os.homedir(), ".cogentia", "var");
}

export function resolveNodeMemoryPath(env = process.env) {
  const configured = String(env.ONA_DB_PATH || "").trim();
  if (configured) return path.resolve(configured);
  return path.join(resolveOpsStateDir(env), "node_memory.sqlite");
}

export function resolveOnaLogPath(env = process.env) {
  const configured = String(env.ONA_LOG_PATH || "").trim();
  if (configured) return path.resolve(configured);

  const stateDir = resolveOpsStateDir(env);
  if (stateDir.includes(path.join(".cogentia", "var"))) {
    return path.join(os.homedir(), ".cogentia", "logs", "ona.log");
  }
  return path.join(path.dirname(stateDir), "logs", "ona.log");
}

export function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}