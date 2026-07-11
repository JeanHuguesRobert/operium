import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defaultAggregatorUrl, tailscaleExecutable } from "./paths.js";

const execFileAsync = promisify(execFile);

export async function fetchJson(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 25000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      method: options.method || "GET",
      headers: { Accept: "application/json", ...(options.headers || {}) },
      body: options.body,
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { ok: false, error: "invalid_json", raw: text.slice(0, 200) };
    }
    return {
      ok: response.ok,
      status: response.status,
      url,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      body: { ok: false, error: error?.name === "AbortError" ? "timeout" : error.message },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeTailscale(options = {}) {
  const executable = options.executable || tailscaleExecutable();
  try {
    const { stdout } = await execFileAsync(executable, ["status", "--json"], {
      timeout: Number(options.timeoutMs || 5000),
      windowsHide: true,
    });
    const parsed = JSON.parse(stdout);
    const selfNode = parsed.Self || {};
    const peers = Object.values(parsed.Peer || {}).map(peer => ({
      hostname: peer.HostName || peer.DNSName || null,
      tailscale_ip: Array.isArray(peer.TailscaleIPs) ? peer.TailscaleIPs[0] : null,
      online: Boolean(peer.Online),
      active: peer.Active || null,
      exit_node: Boolean(peer.ExitNode),
      last_seen: peer.LastSeen || null,
    }));
    return {
      ok: true,
      available: true,
      tailnet: selfNode.TailscaleUUID ? parsed.CurrentTailnet?.Name || null : null,
      hostname: selfNode.HostName || null,
      tailscale_ip: Array.isArray(selfNode.TailscaleIPs) ? selfNode.TailscaleIPs[0] : null,
      peers,
    };
  } catch (error) {
    return {
      ok: false,
      available: false,
      error: error.code === "ENOENT" ? "tailscale_not_installed" : error.message,
      peers: [],
    };
  }
}

export async function probeHttpHealth(url, options = {}) {
  const started = Date.now();
  const result = await fetchJson(url, options);
  const latencyMs = Date.now() - started;
  const healthy = result.ok && result.body?.ok !== false;
  return {
    ok: healthy,
    url,
    status: result.status,
    body: result.body,
    latency_ms: latencyMs,
    error: healthy ? null : result.body?.error || `http_${result.status}`,
  };
}

function skippedProbe(probeKind, reason) {
  return {
    probe_kind: probeKind,
    target: null,
    ok: null,
    skipped: true,
    skip_reason: reason,
    latency_ms: null,
    result: null,
  };
}

/**
 * ONA v1 self-probe matrix — gateway, aggregator, inox, ona self.
 * See operium/docs/operium-node-agent.md § v1 self-probe matrix.
 */
export async function probeOnaServices(catalogue, options = {}) {
  const env = options.env || process.env;
  const timeoutMs = Number(options.timeoutMs || 5000);
  const onaPort = Number(options.onaPort || env.ONA_PORT || 8794);
  const hostname = String(
    options.hostname
    || env.ONA_HOSTNAME
    || env.COMPUTERNAME
    || env.HOSTNAME
    || "",
  ).trim().toLowerCase();

  const node = resolveCatalogueNodeForProbe(catalogue, {
    hostname,
    tailscaleIp: options.tailscaleIp || null,
  });

  const probes = [];

  probes.push(await runOnaProbe("ona", `http://127.0.0.1:${onaPort}/health`, timeoutMs, options));

  if (node?.agent_gateway || node?.capabilities?.includes("agent.cli.gateway")) {
    const port = Number(node?.agent_gateway?.port || 8793);
    probes.push(await runOnaProbe("gateway", `http://127.0.0.1:${port}/health?quick=1`, timeoutMs, options));
  } else {
    probes.push(skippedProbe("gateway", "no_agent_gateway_in_catalogue"));
  }

  const inoxBase = String(node?.transport?.local_url || "").trim()
    || (node?.transport?.inox_serve_port
      ? `http://127.0.0.1:${node.transport.inox_serve_port}`
      : (node?.capabilities?.includes("inox-serve") ? "http://127.0.0.1:8792" : ""));
  if (inoxBase) {
    probes.push(await runOnaProbe("inox", `${inoxBase.replace(/\/$/, "")}/health`, timeoutMs, options));
  } else {
    probes.push(skippedProbe("inox", "no_inox_in_catalogue"));
  }

  const blackboardUrl = String(env.COGENTIA_BLACKBOARD_URL || "").trim();
  const aggregatorUrl = String(env.OPERIUM_AGGREGATOR_URL || defaultAggregatorUrl(env)).replace(/\/$/, "");
  let aggregatorTarget = null;
  if (blackboardUrl) {
    try {
      aggregatorTarget = `${new URL(blackboardUrl).origin}/ops/status`;
    } catch {
      aggregatorTarget = null;
    }
  }
  if (!aggregatorTarget && aggregatorUrl) {
    aggregatorTarget = `${aggregatorUrl}/ops/status`;
  }
  if (aggregatorTarget) {
    probes.push(await runOnaProbe("aggregator", aggregatorTarget, timeoutMs, options));
  } else {
    probes.push(skippedProbe("aggregator", "no_aggregator_url"));
  }

  return {
    hostname,
    catalogue_node: node?.hostname || null,
    resource_id: node?.resource_id || null,
    probes,
    probed_at: new Date().toISOString(),
  };
}

async function runOnaProbe(probeKind, target, timeoutMs, options = {}) {
  if (options.probe === false) {
    return skippedProbe(probeKind, "probe_disabled");
  }
  const result = await probeHttpHealth(target, { timeoutMs, ...options });
  return {
    probe_kind: probeKind,
    target,
    ok: result.ok === true,
    skipped: false,
    latency_ms: result.latency_ms,
    result: {
      status: result.status,
      error: result.error,
      service: result.body?.service || null,
    },
  };
}

function resolveCatalogueNodeForProbe(catalogue, options = {}) {
  const nodes = Array.isArray(catalogue?.nodes) ? catalogue.nodes : [];
  const hostname = String(options.hostname || "").trim().toLowerCase();
  if (hostname) {
    const exact = nodes.find(node => String(node.hostname || "").toLowerCase() === hostname);
    if (exact) return exact;
  }
  if (options.tailscaleIp) {
    const byIp = nodes.find(node => node.transport?.tailscale_ip === options.tailscaleIp);
    if (byIp) return byIp;
  }
  return null;
}

export async function probeLocalServices(catalogue, options = {}) {
  const localHostname = options.hostname || process.env.COMPUTERNAME || process.env.HOSTNAME || null;
  const localNode = catalogue.nodes.find(node => node.hostname === localHostname)
    || catalogue.nodes.find(node => node.role === "capable-retrieval-host")
    || null;

  const services = {};
  const localUrl = localNode?.transport?.local_url;
  if (localUrl && options.probe !== false) {
    services.inox_serve = await probeHttpHealth(`${String(localUrl).replace(/\/$/, "")}/health`, options);
  }

  return {
    hostname: localHostname,
    local_node: localNode?.hostname || null,
    services,
  };
}