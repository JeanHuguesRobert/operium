#!/usr/bin/env node
/**
 * Publish cop/attractor.advertised for operium.node.v1 after probing local ONA /health.
 *
 * Env:
 *   COGENTIA_BLACKBOARD_URL
 *   COGENTIA_BLACKBOARD_UPSERT_TOKEN
 *   ONA_HEARTBEAT_URL              default http://127.0.0.1:8794/health
 *   ONA_HEARTBEAT_TIMEOUT_MS       default 45000
 *   ONA_ATTRACTOR_ID               default attractor:<hostname>:operium-node
 *   ONA_ATTRACTOR_NODE_ID          default resource://<hostname> or catalogue match
 *   ONA_ATTRACTOR_ENDPOINT         literal http://<tailscale_ip>:8794
 *   ONA_ATTRACTOR_TAILSCALE_IP     optional override
 *   ONA_ATTRACTOR_TTL_SECONDS      default 300
 *   ONA_ATTRACTOR_WITHDRAW=1       publish cop/attractor.withdrawn
 *   ONA_READ_TOKEN                 optional — enrich metadata.health_score from /node/status
 */

import { loadOnaHeartbeatEnvFiles } from "../lib/node-agent/heartbeat-env.js";
import { runOnaHeartbeat } from "../lib/node-agent/heartbeat.js";

loadOnaHeartbeatEnvFiles();

const result = await runOnaHeartbeat();

if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(result.exitCode ?? 1);
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.exitCode ?? 0);