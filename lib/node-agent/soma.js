import os from "node:os";
import { buildNodeStatus } from "./status.js";

export const SOMA_PROFILE = "operium.soma.node.v0";

const ATTRIBUTE_DEFINITIONS = Object.freeze({
  "core.user-label": {
    value_type: "String",
    behaviour_type: "Configuration",
    semantics: "Human-assigned, non-unique and non-identifying label",
  },
  "system.hostname": {
    value_type: "String",
    behaviour_type: "Static",
    semantics: "Host name observed by the management agent",
  },
  "system.platform": {
    value_type: "Enumeration",
    behaviour_type: "Static",
    semantics: "Operating-system platform reported by the runtime",
  },
  "system.architecture": {
    value_type: "Enumeration",
    behaviour_type: "Static",
    semantics: "Machine architecture reported by the runtime",
  },
  "system.uptime": {
    value_type: "Duration",
    behaviour_type: "Gauge",
    unit: "second",
    semantics: "Elapsed time since the current operating-system boot",
    sampling: { supported: true, recommended_interval: "PT30S" },
  },
  "system.memory.total": {
    value_type: "UnsignedInteger",
    behaviour_type: "Static",
    unit: "byte",
    semantics: "Total physical memory visible to the operating system",
  },
  "system.memory.free": {
    value_type: "UnsignedInteger",
    behaviour_type: "Gauge",
    unit: "byte",
    semantics: "Physical memory currently reported as free",
    sampling: { supported: true, recommended_interval: "PT30S" },
  },
  "state.operational": {
    value_type: "Enumeration",
    behaviour_type: "State",
    semantics: "Observed ability of the object to perform its primary function",
  },
  "state.health": {
    value_type: "Integer",
    behaviour_type: "Gauge",
    semantics: "Operium health score observed for the object",
    sampling: { supported: true, recommended_interval: "PT3M" },
  },
  "service.probe-latency": {
    value_type: "Duration",
    behaviour_type: "Gauge",
    unit: "millisecond",
    semantics: "Latency of the latest service probe",
    sampling: { supported: true, recommended_interval: "PT3M" },
  },
});

const FACETS = Object.freeze({
  "core.user-labelled": {
    attributes: ["core.user-label"],
  },
  "system.runtime": {
    attributes: [
      "system.hostname",
      "system.platform",
      "system.architecture",
      "system.uptime",
      "system.memory.total",
      "system.memory.free",
    ],
  },
  "state.operational": {
    attributes: ["state.operational"],
  },
  "health.reporting": {
    attributes: ["state.health"],
  },
});

export function buildSomaDescriptor(deps = {}) {
  const generatedAt = deps.generatedAt || new Date().toISOString();
  const nodeId = deps.nodeId || deps.config?.nodeId;
  return {
    schema: "soma.descriptor.v0",
    profile: SOMA_PROFILE,
    identity: nodeId,
    class: "operium.node",
    schema_version: "0",
    semantics: {
      specification: "https://github.com/JeanHuguesRobert/operium/blob/main/docs/soma-semantic-object-management-architecture.md",
      vocabulary: "/soma/vocabulary",
    },
    resources: {
      object: "/soma/object",
      observations: "/soma/observations",
      vocabulary: "/soma/vocabulary",
    },
    capabilities: [
      "soma.object.read",
      "soma.observations.read",
      "soma.vocabulary.read",
    ],
    generated_at: generatedAt,
  };
}

export function buildSomaVocabulary() {
  return {
    schema: "soma.vocabulary.v0",
    profile: SOMA_PROFILE,
    classes: {
      "soma.managed-object": {
        extends: null,
        semantics: "Base class for an identifiable managed object",
      },
      "operium.node": {
        extends: "soma.managed-object",
        facets: [
          "core.user-labelled",
          "system.runtime",
          "state.operational",
          "health.reporting",
        ],
        contains: ["operium.service"],
      },
      "operium.service": {
        extends: "soma.managed-object",
        facets: ["core.user-labelled", "state.operational"],
      },
    },
    facets: FACETS,
    attributes: ATTRIBUTE_DEFINITIONS,
  };
}

export function buildSomaObject(deps = {}) {
  const config = deps.config;
  const db = deps.db;
  const nodeId = deps.nodeId || config?.nodeId;
  const observedAt = deps.observedAt || new Date().toISOString();
  const status = deps.status || buildNodeStatus({
    config,
    db,
    startedAt: deps.startedAt,
    nodeId,
  });
  const runtime = deps.runtime || readRuntime();
  const hostname = status.hostname || config?.hostname || runtime.hostname;
  const incarnation = buildBootIncarnation(hostname, observedAt, runtime.uptimeSeconds);

  return {
    schema: "soma.object.v0",
    profile: SOMA_PROFILE,
    id: nodeId,
    class: "operium.node",
    schema_version: "0",
    facets: [
      "core.user-labelled",
      "system.runtime",
      "state.operational",
      "health.reporting",
    ],
    attributes: {
      "core.user-label": hostname,
      "system.hostname": hostname,
      "system.platform": runtime.platform,
      "system.architecture": runtime.architecture,
      "system.uptime": observation(runtime.uptimeSeconds, observedAt, nodeId, {
        unit: "second",
        incarnation,
      }),
      "system.memory.total": observation(runtime.totalMemory, observedAt, nodeId, {
        unit: "byte",
        incarnation,
      }),
      "system.memory.free": observation(runtime.freeMemory, observedAt, nodeId, {
        unit: "byte",
        incarnation,
      }),
      "state.operational": observation(status.ok ? "enabled" : "degraded", observedAt, nodeId),
      "state.health": observation(status.health_score, observedAt, nodeId),
    },
    children: buildServiceChildren(status, observedAt, nodeId),
    references: [],
    capabilities: [
      "soma.object.read",
      "soma.observations.read",
    ],
    actions: [],
    notifications: [],
    generated_at: observedAt,
  };
}

export function buildSomaObservations(deps = {}) {
  const object = buildSomaObject(deps);
  const observations = [];

  collectObservations(object, observations);
  for (const child of object.children) collectObservations(child, observations);

  return {
    schema: "soma.observations.v0",
    profile: SOMA_PROFILE,
    object: object.id,
    observations,
    generated_at: object.generated_at,
  };
}

function readRuntime() {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    architecture: os.arch(),
    uptimeSeconds: Math.floor(os.uptime()),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
  };
}

function buildServiceChildren(status, observedAt, nodeId) {
  return (status.probes?.items || [])
    .filter(probe => !probe.skipped)
    .map((probe) => {
      const key = normalizeIdentityPart(probe.probe_kind || "service");
      const childId = `${nodeId}/service:${key}`;
      const attributes = {
        "core.user-label": String(probe.probe_kind || "service"),
        "state.operational": observation(probe.ok === true ? "enabled" : "disabled", observedAt, childId),
      };
      if (Number.isFinite(probe.latency_ms)) {
        attributes["service.probe-latency"] = observation(probe.latency_ms, observedAt, childId, {
          unit: "millisecond",
        });
      }
      return {
        id: childId,
        class: "operium.service",
        facets: ["core.user-labelled", "state.operational"],
        attributes,
        children: [],
        references: [],
        capabilities: [],
        actions: [],
        notifications: [],
      };
    });
}

function observation(value, observedAt, source, extra = {}) {
  return {
    value,
    observed_at: observedAt,
    source,
    quality: "measured",
    ...extra,
  };
}

function collectObservations(object, output) {
  for (const [attribute, occurrence] of Object.entries(object.attributes || {})) {
    if (!isObservation(occurrence)) continue;
    output.push({
      object: object.id,
      attribute,
      ...occurrence,
    });
  }
}

function isObservation(value) {
  return Boolean(value && typeof value === "object" && "value" in value && "observed_at" in value);
}

function buildBootIncarnation(hostname, observedAt, uptimeSeconds) {
  const bootMs = Date.parse(observedAt) - Math.max(0, uptimeSeconds) * 1000;
  return `boot:${hostname}:${new Date(bootMs).toISOString().slice(0, 16)}`;
}

function normalizeIdentityPart(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}
