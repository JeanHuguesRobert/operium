import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tailscaleExecutable } from "./paths.js";

const execFileAsync = promisify(execFile);

export async function fetchJson(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 8000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
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
  const result = await fetchJson(url, options);
  const healthy = result.ok && result.body?.ok !== false;
  return {
    ok: healthy,
    url,
    status: result.status,
    body: result.body,
    error: healthy ? null : result.body?.error || `http_${result.status}`,
  };
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