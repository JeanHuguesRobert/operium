import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

export const OBSERVATION_SCHEMA = "operium.fractanet.observation.v1";
export const REPORT_SCHEMA = "operium.fractanet.divergence-report.v1";
const MANIFEST_SCHEMA = "operium.fractanet.observation-manifest.v1";
const COLLECTOR_VERSION = "1";

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertSafe(value, name, pattern) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error(`invalid_observation_${name}`);
  }
  return value;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\\"'\\\"'")}'`;
}

function validateManifest(manifest) {
  if (!manifest || manifest.schema !== MANIFEST_SCHEMA || !Array.isArray(manifest.nodes)) {
    throw new Error("invalid_fractanet_observation_manifest");
  }
  const ids = new Set();
  for (const node of manifest.nodes) {
    const nodeId = assertSafe(node?.node_id, "node_id", /^resource:\/\/[A-Za-z0-9._-]+$/);
    if (ids.has(nodeId)) throw new Error("duplicate_observation_node_id");
    ids.add(nodeId);
    assertSafe(node.ssh_target, "ssh_target", /^[A-Za-z0-9._@:-]+$/);
    if (node.ssh_port != null && (!Number.isInteger(node.ssh_port) || node.ssh_port < 1 || node.ssh_port > 65535)) {
      throw new Error("invalid_observation_ssh_port");
    }
    for (const service of node.services || []) {
      assertSafe(service?.name, "service_name", /^[A-Za-z0-9@_.-]+\.service$/);
      if (service.expected_state && !["active", "inactive", "failed", "unknown"].includes(service.expected_state)) {
        throw new Error("invalid_observation_service_expected_state");
      }
    }
    for (const repository of node.repositories || []) {
      assertSafe(repository?.id, "repository_id", /^[A-Za-z0-9._-]+$/);
      assertSafe(repository?.path, "repository_path", /^\/[A-Za-z0-9._/@-]+$/);
      if (repository.revision && !/^[0-9a-f]{7,64}$/i.test(repository.revision)) {
        throw new Error("invalid_observation_repository_revision");
      }
    }
  }
  return manifest;
}

export async function loadObservationManifest(manifestPath) {
  if (!manifestPath) throw new Error("observation_requires_manifest");
  return validateManifest(YAML.parse(await readFile(manifestPath, "utf8")));
}

export async function loadObservationManifestFromRegistry(registryPath) {
  if (!registryPath) throw new Error("observation_requires_registry");
  const registry = YAML.parse(await readFile(registryPath, "utf8"));
  if (!registry || !Array.isArray(registry.nodes)) throw new Error("invalid_operium_registry");
  const nodes = registry.nodes.map(source => {
    const ssh = source.ssh || source.transport || {};
    const service = source.operium_node_agent?.service;
    return {
      node_id: source.resource_id,
      ssh_target: source.hostname,
      ssh_port: ssh.port || ssh.ssh_port || null,
      expected_os_hostname: source.observation?.expected_os_hostname || null,
      availability: {
        intermittent: source.intermittent === true,
        absence_interpretation: source.wan?.absence_interpretation || null,
      },
      services: service ? [{ name: service, expected_state: "active" }] : [],
      repositories: [],
    };
  });
  return validateManifest({ schema: MANIFEST_SCHEMA, source: "operium-private-registry", nodes });
}

export async function loadObservationSource({ manifestPath, registryPath }) {
  if (manifestPath && registryPath) throw new Error("observation_source_is_ambiguous");
  if (manifestPath) return await loadObservationManifest(manifestPath);
  return await loadObservationManifestFromRegistry(registryPath);
}

export function buildReadOnlyProbeScript(node) {
  validateManifest({ schema: MANIFEST_SCHEMA, nodes: [node] });
  const lines = [
    "set -u",
    "printf 'os_hostname\\t'; hostname",
  ];
  for (const service of node.services || []) {
    const name = shellQuote(service.name);
    lines.push(`state=$(systemctl is-active ${name} 2>/dev/null || true); printf 'service\\t%s\\t%s\\n' ${name} "$state"`);
  }
  for (const repository of node.repositories || []) {
    const id = shellQuote(repository.id);
    const repoPath = shellQuote(repository.path);
    lines.push(`head=$(git -C ${repoPath} rev-parse HEAD 2>/dev/null || true); dirty=$(git -C ${repoPath} status --porcelain 2>/dev/null | wc -l | tr -d ' ' || true); printf 'repository\\t%s\\t%s\\t%s\\n' ${id} "$head" "$dirty"`);
  }
  return `${lines.join("\n")}\n`;
}

export function parseReadOnlyProbe(stdout, node) {
  const observation = { os_hostname: null, services: [], repositories: [] };
  for (const line of String(stdout || "").split(/\r?\n/)) {
    if (!line) continue;
    const fields = line.split("\t");
    if (fields[0] === "os_hostname" && fields.length === 2) observation.os_hostname = fields[1] || null;
    if (fields[0] === "service" && fields.length === 3) observation.services.push({ name: fields[1], state: fields[2] || "unknown" });
    if (fields[0] === "repository" && fields.length === 4) observation.repositories.push({ id: fields[1], revision: fields[2] || null, dirty_entries: Number(fields[3]) || 0 });
  }
  observation.services.sort((a, b) => a.name.localeCompare(b.name));
  observation.repositories.sort((a, b) => a.id.localeCompare(b.id));
  const configuredServices = new Set((node.services || []).map(service => service.name));
  const configuredRepositories = new Set((node.repositories || []).map(repository => repository.id));
  if (observation.services.some(service => !configuredServices.has(service.name)) || observation.repositories.some(repository => !configuredRepositories.has(repository.id))) {
    throw new Error("unexpected_read_only_probe_record");
  }
  return observation;
}

export async function runSshReadOnly({ target, port, script, timeoutMs = 25000 }) {
  return await new Promise((resolve, reject) => {
    const args = ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${Math.max(1, Math.ceil(timeoutMs / 1000))}`];
    if (port) args.push("-p", String(port));
    args.push(target, "sh", "-s");
    const child = spawn("ssh", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`ssh_read_only_probe_failed:${code}:${stderr.trim() || "no_stderr"}`));
    });
    child.stdin.end(script);
  });
}

export async function collectNodeObservation({ node, runSsh = runSshReadOnly, timeoutMs, observedAt = new Date().toISOString() }) {
  const script = buildReadOnlyProbeScript(node);
  try {
    const response = await runSsh({ target: node.ssh_target, port: node.ssh_port, script, timeoutMs });
    const observation = parseReadOnlyProbe(response.stdout, node);
    const evidence = { node_id: node.node_id, command_family: "ssh-read-only-v1", observation };
    return {
      schema: OBSERVATION_SCHEMA,
      collector_version: COLLECTOR_VERSION,
      observed_at: observedAt,
      node_id: node.node_id,
      command_family: "ssh-read-only-v1",
      redaction_policy: "omit-secrets-v1",
      ok: true,
      observation,
      evidence_digest: sha256(evidence),
    };
  } catch (error) {
    // Remote stderr may contain operator-specific details. Keep neither it nor
    // a digest derived from it in the durable observation record.
    const evidence = { node_id: node.node_id, command_family: "ssh-read-only-v1", error: "probe_failed" };
    return {
      schema: OBSERVATION_SCHEMA,
      collector_version: COLLECTOR_VERSION,
      observed_at: observedAt,
      node_id: node.node_id,
      command_family: "ssh-read-only-v1",
      redaction_policy: "omit-secrets-v1",
      ok: false,
      error: "ssh_observation_failed",
      evidence_digest: sha256(evidence),
    };
  }
}

export async function collectNodeObservations({ nodes, concurrency = 3, ...options }) {
  if (!Array.isArray(nodes)) throw new Error("observation_nodes_required");
  const limit = Number(concurrency);
  if (!Number.isInteger(limit) || limit < 1 || limit > 16) throw new Error("invalid_observation_concurrency");
  const results = new Array(nodes.length);
  let cursor = 0;
  async function worker() {
    while (cursor < nodes.length) {
      const index = cursor++;
      results[index] = await collectNodeObservation({ ...options, node: nodes[index] });
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, nodes.length) }, worker));
  return results;
}

export function buildDivergenceReport({ manifest, observations, reportedAt = new Date().toISOString() }) {
  validateManifest(manifest);
  const byNode = new Map(observations.map(observation => [observation.node_id, observation]));
  const divergences = [];
  const uncertainties = [];
  for (const node of manifest.nodes) {
    const observed = byNode.get(node.node_id);
    if (!observed?.ok) {
      const entry = { node_id: node.node_id, invariant: "ssh_reachable", expected: true, observed: false, evidence_digest: observed?.evidence_digest || null };
      if (node.availability?.intermittent) {
        uncertainties.push({ ...entry, reason: "declared_intermittent_node", next: "observe_when_expected_available" });
      } else {
        divergences.push({ ...entry, next: "continuation_required" });
      }
      continue;
    }
    if (node.expected_os_hostname && observed.observation.os_hostname !== node.expected_os_hostname) {
      divergences.push({
        node_id: node.node_id,
        invariant: "os_hostname",
        expected: node.expected_os_hostname,
        observed: observed.observation.os_hostname,
        evidence_digest: observed.evidence_digest,
        next: "continuation_required",
      });
    }
    for (const service of node.services || []) {
      const actual = observed.observation.services.find(item => item.name === service.name)?.state || "unknown";
      if (actual !== (service.expected_state || "active")) divergences.push({ node_id: node.node_id, invariant: `service:${service.name}`, expected: service.expected_state || "active", observed: actual, evidence_digest: observed.evidence_digest, next: "continuation_required" });
    }
    for (const repository of node.repositories || []) {
      const actual = observed.observation.repositories.find(item => item.id === repository.id);
      if (repository.revision && actual?.revision !== repository.revision) divergences.push({ node_id: node.node_id, invariant: `repository_revision:${repository.id}`, expected: repository.revision, observed: actual?.revision || null, evidence_digest: observed.evidence_digest, next: "continuation_required" });
      if (repository.allow_dirty === false && (actual?.dirty_entries || 0) > 0) divergences.push({ node_id: node.node_id, invariant: `repository_clean:${repository.id}`, expected: true, observed: false, evidence_digest: observed.evidence_digest, next: "continuation_required" });
    }
  }
  divergences.sort((a, b) => `${a.node_id}:${a.invariant}`.localeCompare(`${b.node_id}:${b.invariant}`));
  return { schema: REPORT_SCHEMA, collector_version: COLLECTOR_VERSION, reported_at: reportedAt, ok: divergences.length === 0, divergences, uncertainties, evidence_digest: sha256({ schema: REPORT_SCHEMA, divergences, uncertainties }) };
}

export function buildDivergenceContinuations(report) {
  if (report?.schema !== REPORT_SCHEMA) throw new Error("invalid_divergence_report");
  return report.divergences.map(divergence => {
    const suffix = sha256({ invariant: divergence.invariant, node_id: divergence.node_id, evidence_digest: divergence.evidence_digest }).slice(0, 16);
    const id = `ctn_operium_mesh_${suffix}`;
    return {
      type: "continuation",
      protocol: "cogentia.continuation.v2",
      id,
      continuation_id: id,
      status: "active",
      kind: "operium.fractanet.divergence",
      title: `FractaNet divergence: ${divergence.invariant}`,
      question: `Is the observed divergence on ${divergence.node_id} intentional, and if not, what explicitly authorized reconciliation is appropriate?`,
      subject: { repo: "JeanHuguesRobert/operium", path: "backlog/items.yaml" },
      context: { node_id: divergence.node_id, invariant: divergence.invariant, expected: divergence.expected, observed: divergence.observed, evidence_digest: divergence.evidence_digest },
      expected_response: { type: "step_result", allowed_statuses: ["success", "needs_acceptance", "failed"] },
      resume: { command: `Set COGENTIA_CONTINUATIONS_DIR to this private Operium continuation store, then run: node scripts/cogentia.js continuation inspect ${id}` },
      history: [{ event: "emitted_from_read_only_observation", evidence_digest: divergence.evidence_digest }],
    };
  });
}

export function persistDivergenceContinuations({ report, directory, now = new Date().toISOString() }) {
  if (!directory) throw new Error("continuation_persistence_requires_directory");
  const continuations = buildDivergenceContinuations(report);
  fs.mkdirSync(directory, { recursive: true });
  const persisted = continuations.map(continuation => {
    const filePath = path.join(directory, `${continuation.id}.json`);
    if (fs.existsSync(filePath)) return { id: continuation.id, status: "existing", path: filePath };
    const record = { ...continuation, created_at: now, updated_at: now, resolution: null };
    fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return { id: continuation.id, status: "created", path: filePath };
  });
  return { schema: "operium.fractanet.continuation-persistence.v1", continuations: persisted };
}
