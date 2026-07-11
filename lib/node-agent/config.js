import os from "node:os";
import { defaultRegistryPath } from "../paths.js";

export const ONA_VERSION = "0.1.0";

export function parseBooleanEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function resolveHostname(env = process.env) {
  const explicit = String(env.ONA_HOSTNAME || "").trim();
  if (explicit) return explicit.toLowerCase();

  const fromOs = String(os.hostname() || "").trim().toLowerCase();
  if (fromOs) return fromOs;

  const computer = String(env.COMPUTERNAME || "").trim().toLowerCase();
  if (computer) return computer;

  return "local";
}

export function resolveNodeId(env = process.env) {
  const configured = String(env.ONA_NODE_ID || "").trim();
  if (configured) return configured;
  return `resource://${resolveHostname(env)}`;
}

export function loadOnaConfig(env = process.env) {
  const bind = String(env.ONA_BIND || "127.0.0.1").trim() || "127.0.0.1";
  const port = Number(env.ONA_PORT || 8794);
  const copDelivery = parseBooleanEnv(env.ONA_COP_DELIVERY, true);

  if (copDelivery && !String(env.ONA_PEER_TOKEN || "").trim()) {
    const error = new Error("ONA_COP_DELIVERY=1 requires ONA_PEER_TOKEN");
    error.code = "missing_ona_peer_token";
    throw error;
  }

  return {
    version: ONA_VERSION,
    bind,
    port,
    hostname: resolveHostname(env),
    nodeId: resolveNodeId(env),
    copDelivery,
    tokens: {
      read: String(env.ONA_READ_TOKEN || "").trim() || null,
      admin: String(env.ONA_ADMIN_TOKEN || "").trim() || null,
      peer: String(env.ONA_PEER_TOKEN || "").trim() || null,
    },
    healthPublic: parseBooleanEnv(env.ONA_HEALTH_PUBLIC, bind === "127.0.0.1"),
    registryPath: String(env.OPERIUM_REGISTRY || "").trim() || defaultRegistryPath(env),
    probeIntervalMs: Number(env.ONA_PROBE_INTERVAL_MS || 180_000),
    probeTimeoutMs: Number(env.ONA_PROBE_TIMEOUT_MS || 5_000),
    jobsEnabled: parseBooleanEnv(env.ONA_JOBS, true),
    jobTickMs: Number(env.ONA_JOB_TICK_MS || 15_000),
    jobIntervalMs: Number(env.ONA_JOB_INTERVAL_MS || 180_000),
    jobTimeoutMs: Number(env.ONA_JOB_TIMEOUT_MS || 120_000),
    env,
  };
}