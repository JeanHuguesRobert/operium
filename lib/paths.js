import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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