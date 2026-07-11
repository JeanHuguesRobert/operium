import { resolveHostname } from "./config.js";

/**
 * Match local node to catalogue entry.
 * Order: ONA_HOSTNAME → tailscale IP → os.hostname → COMPUTERNAME (via resolveHostname).
 */
export function resolveCatalogueNode(catalogue, options = {}) {
  const env = options.env || process.env;
  const hostname = String(options.hostname || resolveHostname(env)).trim().toLowerCase();
  const nodes = Array.isArray(catalogue?.nodes) ? catalogue.nodes : [];

  const byHostname = nodes.find(
    node => String(node.hostname || "").trim().toLowerCase() === hostname,
  );
  if (byHostname) return byHostname;

  const tailscaleIp = String(options.tailscaleIp || env.ONA_TAILSCALE_IP || "").trim();
  if (tailscaleIp) {
    const byIp = nodes.find(node => String(node.transport?.tailscale_ip || "") === tailscaleIp);
    if (byIp) return byIp;
  }

  return null;
}

export function resolvedIdentity(catalogue, config) {
  const node = resolveCatalogueNode(catalogue, {
    env: config.env,
    hostname: config.hostname,
    tailscaleIp: config.env?.ONA_TAILSCALE_IP,
  });

  if (node?.resource_id && node?.hostname) {
    return {
      node_id: node.resource_id,
      hostname: node.hostname,
      catalogue_node: node,
    };
  }

  return {
    node_id: config.nodeId,
    hostname: config.hostname,
    catalogue_node: node,
  };
}