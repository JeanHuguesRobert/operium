import { nextActions as sharedNextActions } from "../drift.js";
import { loadRegistry } from "../registry.js";
import { resolveCatalogueNode } from "./catalogue.js";
import { readLocalState, readLocalStateByNodeId } from "./db.js";
import { readLatestProbes } from "./local-state.js";

const BLACKBOARD_STALE_MS = 15 * 60 * 1000;

export function computeNodeDrift(deps = {}) {
  const config = deps.config;
  const db = deps.db;
  const nodeId = deps.nodeId || config?.nodeId;
  const catalogue = deps.catalogue || loadRegistry({
    registryPath: config?.registryPath,
    env: config?.env,
  });
  const local = readLocalStateByNodeId(db, nodeId) || readLocalState(db);
  const catalogueNode = resolveCatalogueNode(catalogue, {
    env: config?.env,
    hostname: config?.hostname,
    tailscaleIp: config?.env?.ONA_TAILSCALE_IP,
  });

  const drift = [];

  if (!catalogue.ok) {
    drift.push({
      kind: "catalogue_unreachable",
      severity: "error",
      fact: "registry should load",
      observed: catalogue.error || "registry_not_found",
      doc: config?.registryPath || null,
    });
  }

  if (catalogue.ok && !catalogueNode) {
    drift.push({
      kind: "catalogue_vs_live",
      severity: "warn",
      fact: `hostname ${config?.hostname} should match a catalogue node`,
      observed: "no registry entry",
      doc: "operium/docs/fractanet-mesh.md",
    });
  }

  if (catalogueNode?.resource_id && catalogueNode.resource_id !== nodeId) {
    drift.push({
      kind: "identity_mismatch",
      severity: "warn",
      fact: `catalogue resource_id ${catalogueNode.resource_id}`,
      observed: `ONA node_id ${nodeId}`,
    });
  }

  for (const secret of catalogueNode?.secrets || []) {
    if (secret.file_exists === false) {
      drift.push({
        kind: "secret_ref_missing",
        severity: "warn",
        fact: `secret ref ${secret.id}`,
        observed: `file missing at ${secret.stored_in}`,
      });
    }
  }

  const probes = readLatestProbes(db, 12);
  const probeByKind = new Map(probes.map(probe => [probe.probe_kind, probe]));
  const capabilities = catalogueNode?.capabilities || [];

  if (capabilities.includes("agent.cli.gateway")) {
    const gateway = probeByKind.get("gateway");
    if (gateway && gateway.ok !== 1) {
      drift.push({
        kind: "local_service_down",
        severity: "warn",
        fact: "agent-gateway expected from catalogue",
        observed: gateway.target || "gateway probe failed",
      });
    }
  }

  if (capabilities.includes("inox-serve") || catalogueNode?.transport?.local_url) {
    const inox = probeByKind.get("inox");
    if (inox && inox.ok !== 1) {
      drift.push({
        kind: "local_service_down",
        severity: "warn",
        fact: "local inox-serve expected on capable host",
        observed: inox.target || "inox probe failed",
      });
    }
  }

  const ona = probeByKind.get("ona");
  if (ona && ona.ok !== 1) {
    drift.push({
      kind: "local_service_down",
      severity: "error",
      fact: "ONA self probe should pass",
      observed: ona.target || "ona probe failed",
    });
  }

  const blackboardUrl = String(config?.env?.COGENTIA_BLACKBOARD_URL || "").trim();
  if (blackboardUrl) {
    const lastSync = local?.last_blackboard_sync_at;
    if (!lastSync) {
      drift.push({
        kind: "blackboard_stale",
        severity: "warn",
        fact: "blackboard URL configured",
        observed: "no sync recorded",
      });
    } else {
      const ageMs = Date.now() - Date.parse(lastSync);
      if (!Number.isFinite(ageMs) || ageMs > BLACKBOARD_STALE_MS) {
        drift.push({
          kind: "blackboard_stale",
          severity: "warn",
          fact: "blackboard sync should be recent",
          observed: `last sync ${lastSync}`,
        });
      }
    }
  }

  const healthScore = Number(local?.health_score ?? 0);
  if (healthScore < 3) {
    drift.push({
      kind: "health_degraded",
      severity: healthScore <= 1 ? "error" : "warn",
      fact: "health_score should be >= 3",
      observed: String(healthScore),
    });
  }

  return drift;
}

export function buildNodeDrift(deps = {}) {
  const config = deps.config;
  const nodeId = deps.nodeId || config?.nodeId;
  const local = readLocalStateByNodeId(deps.db, nodeId) || readLocalState(deps.db);
  const drift = computeNodeDrift(deps);
  const healthScore = Number(local?.health_score ?? 0);
  const criticalPathOk = !drift.some(item => item.severity === "error");

  const next_actions = uniqueActions([
    ...sharedNextActions(drift, { health_score: healthScore, critical_path_ok: criticalPathOk }),
    ...nodeSpecificActions(drift, config),
  ]);

  return {
    schema: "operium.node.drift.v1",
    node_id: nodeId,
    hostname: local?.hostname || config?.hostname || null,
    health_score: healthScore,
    drift,
    next_actions,
    generated_at: new Date().toISOString(),
  };
}

function nodeSpecificActions(drift, config) {
  const actions = [];
  for (const item of drift) {
    if (item.kind === "identity_mismatch") {
      actions.push("Align ONA_NODE_ID / ONA_HOSTNAME with catalogue resource_id.");
    }
    if (item.kind === "catalogue_vs_live") {
      actions.push(`Add or fix registry entry for ${config?.hostname} in resources.yaml.`);
    }
    if (item.kind === "catalogue_unreachable") {
      actions.push("Restore OPERIUM_REGISTRY path and resources.yaml readability.");
    }
    if (item.kind === "blackboard_stale") {
      actions.push("Check CogentiaOperiumNodeHeartbeat task and COGENTIA_BLACKBOARD_URL.");
    }
    if (item.kind === "health_degraded") {
      actions.push("Run operium node status --human and inspect failed probes.");
    }
  }
  return actions;
}

function uniqueActions(actions) {
  return [...new Set(actions.filter(Boolean))];
}