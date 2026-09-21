import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
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

export function buildReadOnlyProbeScript(node) {
  validateManifest({ schema: MANIFEST_SCHEMA, nodes: [node] });
  const lines = [
    "set -u",
    "printf 'hostname\\t'; hostname",
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
  const observation = { hostname: null, services: [], repositories: [] };
  for (const line of String(stdout || "").split(/\r?\n/)) {
    if (!line) continue;
    const fields = line.split("\t");
    if (fields[0] === "hostname" && fields.length === 2) observation.hostname = fields[1] || null;
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

export async function runSshReadOnly({ target, script, timeoutMs = 25000 }) {
  return await new Promise((resolve, reject) => {
    const child = spawn("ssh", ["-o", "BatchMode=yes", "-o", `ConnectTimeout=${Math.max(1, Math.ceil(timeoutMs / 1000))}`, target, "sh", "-s"], { stdio: ["pipe", "pipe", "pipe"] });
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
    const response = await runSsh({ target: node.ssh_target, script, timeoutMs });
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

export function buildDivergenceReport({ manifest, observations, reportedAt = new Date().toISOString() }) {
  validateManifest(manifest);
  const byNode = new Map(observations.map(observation => [observation.node_id, observation]));
  const divergences = [];
  for (const node of manifest.nodes) {
    const observed = byNode.get(node.node_id);
    if (!observed?.ok) {
      divergences.push({ node_id: node.node_id, invariant: "ssh_reachable", expected: true, observed: false, evidence_digest: observed?.evidence_digest || null, next: "continuation_required" });
      continue;
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
  return { schema: REPORT_SCHEMA, collector_version: COLLECTOR_VERSION, reported_at: reportedAt, ok: divergences.length === 0, divergences, evidence_digest: sha256({ schema: REPORT_SCHEMA, divergences }) };
}
