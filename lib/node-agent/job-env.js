import fs from "node:fs";
import path from "node:path";
import { expandHome } from "../paths.js";

export function loadEnvFiles(files = [], baseEnv = process.env) {
  const env = { ...baseEnv };
  for (const file of files) {
    if (!file) continue;
    const resolved = path.resolve(expandHome(String(file)));
    if (!fs.existsSync(resolved)) continue;
    loadEnvFileInto(resolved, env);
  }
  return env;
}

export function loadEnvFileInto(filePath, env = process.env) {
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (env[key] != null) continue;
    env[key] = unquoteEnvValue(match[2]);
  }
  return env;
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