import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function loadOnaHeartbeatEnvFiles(files = defaultOnaEnvFiles()) {
  for (const file of files) {
    if (!file) continue;
    const resolved = path.resolve(String(file));
    if (!fs.existsSync(resolved)) continue;
    const content = fs.readFileSync(resolved, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      const key = match[1];
      if (process.env[key] != null) continue;
      process.env[key] = unquoteEnvValue(match[2]);
    }
  }
}

export function defaultOnaEnvFiles(env = process.env) {
  return [
    env.ONA_ATTRACTOR_ENV_FILE,
    env.ONA_HEARTBEAT_ENV_FILE,
    env.COGENTIA_ATTRACTOR_ENV_FILE,
    env.COGENTIA_ENV_FILE,
    path.join(os.homedir(), "srv", "cogentia", "secrets", "ona-heartbeat.env"),
    path.join(os.homedir(), "srv", "cogentia", "secrets", "attractor-heartbeat.env"),
    path.join(os.homedir(), ".cogentia", "secrets", "ona-heartbeat.env"),
    path.join(os.homedir(), ".cogentia", "secrets", "attractor-heartbeat.env"),
    path.join(os.homedir(), ".cogentia", "secrets", "agent-gateway-blackboard.env"),
  ];
}

function unquoteEnvValue(value) {
  const trimmed = String(value || "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseBooleanEnv(value, fallback = false) {
  if (value == null || value === "") return fallback;
  const clean = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(clean)) return true;
  if (["0", "false", "no", "off"].includes(clean)) return false;
  return fallback;
}