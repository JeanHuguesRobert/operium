import fs from "node:fs";
import { parse as parseYaml } from "yaml";
import { defaultRegistryPath } from "./paths.js";

export function loadRegistry(options = {}) {
  const registryPath = options.registryPath || defaultRegistryPath(options.env);
  if (!fs.existsSync(registryPath)) {
    return {
      ok: false,
      registry_path: registryPath,
      error: "registry_not_found",
      nodes: [],
      planned_nodes: ["rpi3-view"],
    };
  }

  let parsed;
  try {
    parsed = parseYaml(fs.readFileSync(registryPath, "utf8")) || {};
  } catch (error) {
    return {
      ok: false,
      registry_path: registryPath,
      error: `registry_parse_failed: ${error.message}`,
      nodes: [],
      planned_nodes: [],
    };
  }

  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes.map(normalizeCatalogueNode) : [];
  const knownHostnames = new Set(nodes.map(node => node.hostname).filter(Boolean));
  const planned_nodes = ["rpi3-view"].filter(host => !knownHostnames.has(host));

  return {
    ok: true,
    registry_path: registryPath,
    version: parsed.version ?? null,
    updated_at: parsed.updated_at ?? null,
    nodes,
    planned_nodes,
  };
}

function normalizeCatalogueNode(raw = {}) {
  const secrets = Array.isArray(raw.secrets) ? raw.secrets.map(item => ({
    id: item.id || null,
    ref: item.ref || null,
    stored_in: item.stored_in || null,
    note: item.note || null,
    file_exists: secretFileExists(item.stored_in),
  })) : [];

  return {
    resource_id: raw.resource_id || null,
    hostname: raw.hostname || null,
    os: raw.os || null,
    role: raw.role || null,
    trust_perimeter: raw.trust_perimeter || null,
    intermittent: Boolean(raw.intermittent),
    capabilities: Array.isArray(raw.capabilities) ? raw.capabilities : [],
    secrets,
    blackboard: raw.blackboard || null,
    transport: raw.transport || null,
  };
}

function secretFileExists(storedIn) {
  if (!storedIn) return null;
  try {
    return fs.existsSync(String(storedIn));
  } catch {
    return false;
  }
}