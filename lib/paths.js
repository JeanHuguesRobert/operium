import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const operiumRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function expandHome(input) {
  const value = String(input || "").trim();
  if (!value) return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  if (process.platform === "win32" && /^~\\/.test(value)) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

export function defaultRegistryPath(env = process.env) {
  const configured = expandHome(env.OPERIUM_REGISTRY || env.COGENTIA_REGISTRY || "");
  if (configured) {
    const direct = path.resolve(configured);
    if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
    const nested = path.join(direct, "resources.yaml");
    if (fs.existsSync(nested)) return nested;
  }
  return path.join(os.homedir(), ".cogentia", "registry", "resources.yaml");
}

export function defaultAggregatorUrl(env = process.env) {
  return String(env.OPERIUM_AGGREGATOR_URL || "https://cogentia.fractavolta.com").replace(/\/$/, "");
}

export function tailscaleExecutable() {
  if (process.platform === "win32") {
    const candidate = "C:\\Program Files\\Tailscale\\tailscale.exe";
    if (fs.existsSync(candidate)) return candidate;
  }
  return "tailscale";
}

export function resolveCogentiaRoot(env = process.env) {
  const candidates = [
    expandHome(env.OPERIUM_COGENTIA_ROOT || env.COGENTIA_ROOT || ""),
    path.join(operiumRoot, "..", "cogentia"),
    path.join(os.homedir(), "srv", "cogentia", "repos", "cogentia"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const root = path.resolve(candidate);
    const invokeScript = path.join(root, "scripts", "agent-gateway-invoke.js");
    if (fs.existsSync(invokeScript)) return root;
  }
  return null;
}

export function resolveCogentiaInvokeScript(env = process.env) {
  const root = resolveCogentiaRoot(env);
  if (!root) return null;
  return path.join(root, "scripts", "agent-gateway-invoke.js");
}

export function resolveCorpusRegistryPath(env = process.env) {
  const configured = expandHome(env.COGENTIA_REGISTRY || "");
  if (configured && fs.existsSync(configured)) {
    return path.resolve(configured);
  }
  const workspaceRoot = path.resolve(operiumRoot, "..");
  const candidates = [
    path.join(workspaceRoot, "JeanHuguesRobert", ".cogentia.json"),
    path.join(workspaceRoot, ".cogentia.json"),
    path.join(os.homedir(), "srv", "cogentia", "repos", "JeanHuguesRobert", ".cogentia.json"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolveCorpusRepoNames(options = {}) {
  if (Array.isArray(options.repos) && options.repos.length > 0) {
    return options.repos;
  }
  const registryPath = options.registryPath || resolveCorpusRegistryPath(options.env);
  if (registryPath && fs.existsSync(registryPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(registryPath, "utf8"));
      if (Array.isArray(raw.repos)) {
        const names = raw.repos.map(r => (typeof r === "string" ? r : r?.name)).filter(Boolean);
        if (names.length > 0) return names;
      }
      if (raw.repositories && typeof raw.repositories === "object") {
        const names = Object.keys(raw.repositories);
        if (names.length > 0) return names;
      }
    } catch {
      // fallback on error
    }
  }
  return ["operium", "cogentia", "JeanHuguesRobert", "barons-Mariani"];
}