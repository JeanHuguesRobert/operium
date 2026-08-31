import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadRegistry } from "./registry.js";

const execFileAsync = promisify(execFile);

async function onaReachable(host, port, timeoutMs) {
  try {
    const response = await fetch(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch { return false; }
}

export async function recoverOna(options = {}) {
  const host = String(options.host || "").trim();
  if (!host) throw new Error("recover_ona_requires_host");
  const registry = loadRegistry({ registryPath: options.registryPath, env: options.env });
  const node = registry.nodes.find(item => item.hostname === host);
  const recovery = node?.operium_node_agent?.recovery;
  if (!recovery?.ssh_command) throw new Error("recover_ona_not_configured");
  const port = Number(node.operium_node_agent.port || 8794);
  if (await onaReachable(host, port, 3000)) return { ok: true, host, outcome: "already_healthy", attempted: false };
  try {
    await execFileAsync("ssh", [host, recovery.ssh_command], { timeout: 15000, windowsHide: true });
  } catch (error) {
    return { ok: false, host, outcome: "restart_failed", attempted: true, error: error.message };
  }
  const waitMs = Number(recovery.wait_ms || 8000);
  await new Promise(resolve => setTimeout(resolve, waitMs));
  const healthy = await onaReachable(host, port, 8000);
  return { ok: healthy, host, outcome: healthy ? "recovered" : "restart_unverified", attempted: true };
}
