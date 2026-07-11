import { loadRegistry } from "../registry.js";
import { probeOnaServices } from "../probes.js";
import { resolvedIdentity } from "./catalogue.js";
import { applyProbeCycle } from "./local-state.js";
import { appendEventLog } from "./db.js";
import { syncPeersFromBlackboard } from "./peer-sync.js";
import { runTtlSweeper } from "./ttl-sweeper.js";
import { deliverCopOutbox } from "./cop-deliverer.js";

export function createProbeWorker(deps = {}) {
  const db = deps.db;
  const config = deps.config;
  const intervalMs = Number(deps.intervalMs || config.probeIntervalMs || 180_000);
  let timer = null;
  let running = false;
  let identity = deps.identity || {
    node_id: config.nodeId,
    hostname: config.hostname,
  };

  async function runCycle(options = {}) {
    if (running) return { ok: false, error: "probe_cycle_in_progress" };
    running = true;
    try {
      const catalogue = loadRegistry({
        registryPath: config.registryPath,
        env: config.env,
      });
      identity = resolvedIdentity(catalogue, config);

      const cycle = await probeOnaServices(catalogue, {
        env: config.env,
        hostname: identity.hostname,
        onaPort: config.port,
        timeoutMs: config.probeTimeoutMs,
        probe: options.probe,
      });

      const summary = applyProbeCycle(db, cycle, {
        catalogue,
        nodeId: identity.node_id,
        hostname: identity.hostname,
      });

      let peerSync = null;
      if (options.peerSync !== false && String(config.env?.COGENTIA_BLACKBOARD_URL || "").trim()) {
        peerSync = await syncPeersFromBlackboard(db, {
          env: config.env,
          nodeId: identity.node_id,
          selfAttractorId: config.env?.ONA_ATTRACTOR_ID
            || `attractor:${identity.hostname}:operium-node`,
          timeoutMs: config.probeTimeoutMs,
          fresh: options.freshPeers !== false,
        });
      }

      const ttlSweep = runTtlSweeper(db);

      let copDelivery = null;
      if (config.copDelivery && String(config.tokens?.peer || "").trim()) {
        copDelivery = await deliverCopOutbox(db, {
          token: config.tokens.peer,
          fetch: options.fetch,
          timeoutMs: config.probeTimeoutMs,
          enabled: options.copDelivery !== false,
        });
      }

      if (options.log !== false) {
        appendEventLog(db, "ona.probe_cycle", {
          health_score: summary.health_score,
          probe_count: summary.probe_count,
          failed_count: summary.failed_count,
          peer_sync: peerSync?.ok ? {
            peer_count: peerSync.peer_count,
            fresh_peer_count: peerSync.fresh_peer_count,
          } : { ok: false, error: peerSync?.error || "skipped" },
          ttl_removed: ttlSweep.total_removed,
          cop_delivery: copDelivery,
        });
      }

      return {
        ok: true,
        identity,
        cycle,
        summary,
        peer_sync: peerSync,
        ttl_sweep: ttlSweep,
        cop_delivery: copDelivery,
      };
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      runCycle().catch((error) => {
        appendEventLog(db, "ona.probe_cycle_failed", {
          message: error.message || null,
        });
      });
    }, intervalMs);
    if (typeof timer.unref === "function") timer.unref();
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return {
    runCycle,
    start,
    stop,
    getIdentity: () => identity,
  };
}