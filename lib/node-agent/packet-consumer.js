// Experimental ONA implementation profile for Inseme #165, not a COP protocol revision.
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { appendCopEvent, getCopEvent } from "./cop-events.js";
import { mobileSshInvocation, filterMobileOutput } from "./mobile-diagnostic.js";
import { createExecutionBinding, createExecutionReceipt } from "../../../inseme/packages/magistral/src/execution.js";

export const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
};
export const hash = value => crypto.createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
const fail = code => { throw new Error(code); };
const exact = (value, keys) => {
  if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).sort().join() !== [...keys].sort().join()) fail("invalid_fields");
};
const hex = value => /^[a-f0-9]{64}$/.test(value || "");
export const packetKey = request => `packet:${hash([request.repository, request.issue, request.id])}`;
const event = (db, id) => getCopEvent(db, id)?.envelope.payload;
const record = (db, id, kind, payload) => appendCopEvent(db, { id, kind, payload });
function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try { const result = fn(); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function validatePacket(request) {
  exact(request, ["schema", "id", "repository", "issue", "operation", "timeout_ms", "return"]);
  if (request.schema !== "operium.packet-request/v1" || typeof request.id !== "string" || typeof request.repository !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(request.id || "") ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(request.repository || "") ||
      !Number.isSafeInteger(request.issue) || request.issue < 1 ||
      !Number.isInteger(request.timeout_ms) || request.timeout_ms < 100 || request.timeout_ms > 15000) fail("invalid_request");
  exact(request.return, ["github_issue"]);
  if (request.return.github_issue !== request.issue) fail("return_target_mismatch");
  if (request.operation?.kind === "local.sha256/v1") {
    exact(request.operation, ["kind", "text"]);
    if (typeof request.operation.text !== "string" || Buffer.byteLength(request.operation.text) > 4096) fail("invalid_hash_input");
  } else if (request.operation?.kind === "mobile.termux.diagnostic/v1") {
    exact(request.operation, ["kind", "target"]);
    if (request.operation.target !== "poco-jhr") fail("unsupported_target");
  } else if (request.operation?.kind === "service.health.check/v1") {
    exact(request.operation, ["kind", "service"]);
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(request.operation.service || "")) fail("unsupported_service");
  } else fail("unsupported_operation");
  return request;
}

export function parseIssue(issue, repository) {
  if (issue?.pull_request || issue?.state !== "open" || !Number.isSafeInteger(issue.number) ||
      issue.html_url !== `https://github.com/${repository}/issues/${issue.number}` || typeof issue.body !== "string" ||
      Buffer.byteLength(issue.body) > 65536) fail("invalid_issue");
  const candidates = [...issue.body.matchAll(/```json\s*([\s\S]*?)```/g)].flatMap(match => {
    try { const value = JSON.parse(match[1]); return value?.schema === "operium.packet-request/v1" ? [value] : []; }
    catch { return []; }
  });
  if (candidates.length !== 1) fail("one_typed_packet_required");
  const request = validatePacket(candidates[0]);
  if (request.repository !== repository || request.issue !== issue.number) fail("issue_identity_mismatch");
  // Author and webhook authentication are observations, never execution authority.
  return { request, provenance: { issue: issue.html_url, body_sha256: hash(issue.body),
    author: issue.user?.login || null, transport: "github-api-reconciliation", webhook_verified: false } };
}

export function defaultProviders({ execute = spawnSync, hostname = os.hostname(), simulation = false, serviceChecks = {} } = {}) {
  return {
    "service.health.check/v1": { id: "provider:service:health", control_ref: "operium:service-health:v1", simulation,
      catalogue_sha256: hash(serviceChecks), runtime_hostname: hostname,
      run(request) {
        if (simulation && execute === spawnSync) fail("simulation_requires_fake_executor");
        const entry = serviceChecks[request.operation.service];
        if (!entry || typeof entry.url !== "string" || entry.hostname !== hostname) fail("unsupported_service");
        const result = execute(process.execPath, [fileURLToPath(new URL("../../scripts/service-check-worker.js", import.meta.url))], {
          input: JSON.stringify({ url: entry.url, timeout_ms: Math.max(100, request.timeout_ms - 100) }),
          encoding: "utf8", timeout: request.timeout_ms, maxBuffer: 8192, killSignal: "SIGKILL", shell: false,
          windowsHide: true,
        });
        if (result.error || result.status !== 0) return { status: result.error?.code === "ETIMEDOUT" ? "timed_out" : "failed", output: { error: "probe_worker_failed" } };
        const observation = JSON.parse(result.stdout);
        // Completing an observation does not establish service health or usability.
        if (!observation.observed_at || !['unknown', 'degraded', 'reported_healthy'].includes(observation.health)) fail("invalid_probe_result");
        return { status: "completed", output: { service: request.operation.service, ...observation } };
      } },
    "local.sha256/v1": { id: "provider:local:sha256", control_ref: "operium:local-sha256:v1", simulation,
      run: request => ({ status: "completed", output: { sha256: hash(request.operation.text) } }) },
    "mobile.termux.diagnostic/v1": { id: "provider:ssh:fracta", control_ref: "operium:mobile-termux:v1", simulation,
      available: () => hostname === "fracta",
      run(request) {
        if (simulation && execute === spawnSync) fail("simulation_requires_fake_executor");
        const invocation = mobileSshInvocation("fracta-local", hostname);
        const result = execute(invocation.command, invocation.args, { encoding: "utf8", timeout: request.timeout_ms,
          killSignal: "SIGKILL", maxBuffer: 8192, stdio: ["ignore", "pipe", "pipe"], shell: false });
        const output = filterMobileOutput(result);
        const status = result.error?.code === "ETIMEDOUT" || [124, 137].includes(result.status) ? "timed_out"
          : result.status === 0 && !result.error && output.valid ? "completed" : "failed";
        return { status, output: { ...output, exit_code: result.status ?? null } };
      } },
  };
}

// Local trust configuration is operator-controlled. No key or grant is loaded from an Issue.
export function authorize({ db, request, signedGrant, policy, source, provider, now = Date.now(), delivery = false }) {
  const grant = signedGrant?.grant;
  if (!grant || policy?.enabled !== true || typeof grant.issuer !== "string" || !grant.issuer ||
      typeof grant.principal !== "string" || !grant.principal || !hex(source?.implementation_sha256)) fail("grant_required");
  const issuer = policy.issuers?.[grant.issuer];
  if (!issuer || issuer.principal !== grant.principal) fail("untrusted_principal");
  let valid = false;
  try {
    const key = crypto.createPublicKey(issuer.public_key);
    valid = key.asymmetricKeyType === "ed25519" && crypto.verify(null, Buffer.from(canonical(grant)), key,
      Buffer.from(signedGrant.signature || "", "base64"));
  } catch { /* Fail closed without disclosing key material. */ }
  if (!valid) fail("invalid_grant_signature");
  const standing = grant.schema === "operium.service-check-grant/v1";
  const scopeAllowed = standing ? request.operation.kind === "service.health.check/v1" &&
    Array.isArray(grant.requests) && grant.requests.some(scope => scope.repository === request.repository && scope.issue === request.issue) &&
    Array.isArray(grant.services) && grant.services.includes(request.operation.service) &&
    grant.catalogue_sha256 === provider.catalogue_sha256 &&
    Number.isInteger(grant.max_executions) && grant.max_executions >= 1 && grant.max_executions <= 1000 &&
    Number.isInteger(grant.min_interval_ms) && grant.min_interval_ms >= 60000 &&
    Date.parse(grant.expires_at) - Date.parse(grant.not_before) <= 31 * 86400000 :
    grant.schema === "operium.packet-grant/v1" && grant.request_sha256 === hash(request) && grant.max_executions === 1;
  if (typeof grant.id !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(grant.id || "") || !scopeAllowed ||
      grant.implementation_sha256 !== source.implementation_sha256 ||
      grant.provider_ref !== provider.id || grant.control_ref !== provider.control_ref ||
      grant.effect_ceiling !== "read-only" || grant.execution !== true ||
      grant.timeout_ms !== request.timeout_ms || grant.simulation !== provider.simulation ||
      !Number.isFinite(Date.parse(grant.not_before)) || Date.parse(grant.not_before) > now ||
      !Number.isFinite(Date.parse(grant.expires_at)) || Date.parse(grant.expires_at) <= now ||
      !policy.repositories?.includes(request.repository)) fail("grant_not_admitted");
  if (request.operation.kind === "service.health.check/v1" &&
      (grant.catalogue_sha256 !== provider.catalogue_sha256 || provider.catalogue_sha256 !== hash(policy.service_checks || {}) ||
       !policy.service_checks?.[request.operation.service])) fail("service_catalogue_changed");
  if (request.operation.kind === "service.health.check/v1" &&
      policy.service_checks[request.operation.service].hostname !== provider.runtime_hostname) fail("service_runtime_mismatch");
  const pinnedGrant = event(db, `packet:grant-authority:${grant.id}`);
  if (pinnedGrant && pinnedGrant.grant_sha256 !== hash(grant)) fail("grant_identity_conflict");
  if (policy.revoked_grants?.includes(grant.id)) {
    record(db, `packet:revoked:${grant.id}`, "cop/packet.grant-revoked.v1", { grant_id: grant.id });
  }
  if (event(db, `packet:revoked:${grant.id}`)) fail("grant_revoked");
  if (delivery && grant.publish_receipt !== true) fail("delivery_not_authorized");
  return grant;
}

// Queue, decisions, claim and outbox are projections of the existing COP event store.
// Transactions serialize competing processes sharing THIS store, never separate stores.
export function consumePacket({ db, packet, signedGrant, policy, source, providers = defaultProviders(),
  now = Date.now, runtime = os.hostname(), beforeExecute = () => {}, publish } = {}) {
  const request = validatePacket(packet.request);
  const key = packetKey(request), digest = hash(request);
  record(db, `${key}:observation:${hash([digest, packet.provenance?.body_sha256 || null])}`,
    "cop/github.observed.v1", { request_sha256: digest, provenance: packet.provenance || null });
  const provider = providers[request.operation.kind];
  if (!provider || !provider.id || !provider.control_ref) fail("provider_unavailable");
  const currentPolicy = () => typeof policy === "function" ? policy() : policy;
  const check = delivery => authorize({ db, request, signedGrant, policy: currentPolicy(), source, provider, now: now(), delivery });
  let grant;
  try { grant = check(false); }
  catch (error) {
    record(db, `${key}:rejection:${hash([digest, error.message, signedGrant?.signature || ""])}`,
      "cop/packet.decision.v1", { status: "rejected", request_sha256: digest, reason: error.message });
    throw error;
  }
  const identity = { request_sha256: digest, implementation_sha256: source.implementation_sha256,
    provider_ref: provider.id, control_ref: provider.control_ref, simulation: provider.simulation };
  if (provider.catalogue_sha256) identity.catalogue_sha256 = provider.catalogue_sha256;
  const same = prior => { if (canonical(prior.identity) !== canonical(identity)) fail("packet_identity_conflict"); };
  transaction(db, () => {
    const queued = event(db, `${key}:queued`);
    if (queued) same(queued);
    else {
      record(db, `${key}:queued`, "cop/packet.queued.v1", { request, identity, source });
    }
  });
  let receipt = event(db, `${key}:result`);
  if (receipt) same(receipt);
  else {
    const previous = event(db, `${key}:claim`);
    if (previous) { same(previous); return { ok: false, status: "needs_acceptance", error: "claimed_execution_outcome_unknown", binding: previous.binding }; }
    if (provider.available && !provider.available()) return { ok: false, status: "queued", error: "provider_unavailable" };
    let binding;
    transaction(db, () => {
      grant = check(false);
      if (event(db, `${key}:claim`)) fail("claim_contended");
      let spendKey = `packet:grant-spent:${grant.id}`;
      if (grant.schema === "operium.service-check-grant/v1") {
        if (event(db, spendKey)) fail("grant_identity_conflict");
        const usage = db.prepare("SELECT envelope_json FROM cop_events WHERE kind = 'cop/packet.grant-spent.v1' AND obligation_id = ? LIMIT 1001").all(`grant:${grant.id}`)
          .map(row => JSON.parse(row.envelope_json).payload);
        if (usage.some(value => value.grant_sha256 !== hash(grant))) fail("grant_identity_conflict");
        if (usage.length >= grant.max_executions) fail("grant_budget_spent");
        if (usage.some(value => now() - Date.parse(value.spent_at) < grant.min_interval_ms)) fail("grant_rate_limited");
        spendKey += `:${hash(key)}`;
      } else if (event(db, spendKey)) fail("grant_budget_spent");
      if (grant.schema === "operium.service-check-grant/v1")
        record(db, `packet:grant-authority:${grant.id}`, "cop/packet.grant-authority.v1", { grant_sha256: hash(grant) });
      const runId = crypto.randomUUID();
      binding = createExecutionBinding({ requirement_ref: `requirement:${key}`, offer_id: provider.id,
        runtime_id: `runtime:ona:${runtime}`, handler_instance_ref: `handler:ona:${runId}`,
        execution_surface: "batch", provider_ref: provider.id, provider_execution_id: runId });
      record(db, spendKey, "cop/packet.grant-spent.v1", { key, request_sha256: digest,
        obligation_id: `grant:${grant.id}`, grant_id: grant.id, grant_sha256: hash(grant), spent_at: new Date(now()).toISOString() });
      record(db, `${key}:claim`, "cop/execution.bound.v1", { identity, binding, grant_id: grant.id,
        grant_sha256: hash(grant), principal: grant.principal, started_at: new Date(now()).toISOString() });
    });
    // A crash here leaves a durable orphan. No lease timeout permits re-execution.
    beforeExecute();
    let outcome, attempted = false;
    try {
      check(false); // Refresh revocation/expiry after claim, immediately before effect.
      attempted = true;
      outcome = provider.run(request);
      if (outcome?.then) fail("async_provider_not_supported");
      if (!["completed", "failed", "timed_out"].includes(outcome?.status)) fail("invalid_provider_result");
    } catch { outcome = { status: "failed", output: {}, error: "provider_or_authority_failed" }; }
    const executionReceipt = createExecutionReceipt({ binding, status: outcome.status,
      result_refs: [`cop-event:${key}:result`], error: outcome.status === "completed" ? null : "provider_or_authority_failed" });
    receipt = { schema: "cop.compute-result/v1", computation_id: request.id, identity,
      repository: request.repository, issue: request.issue, source, simulation: provider.simulation,
      ok: outcome.status === "completed", attempted, execution_binding: binding, execution_receipt: executionReceipt,
      output: outcome.output, finished_at: new Date(now()).toISOString() };
    record(db, `${key}:result`, "cop/execution.receipt.v1", receipt);
  }
  const delivered = event(db, `${key}:delivery`);
  if (delivered) { same(delivered); return { ...receipt, replayed: true, delivery: delivered }; }
  if (!publish) return { ...receipt, delivery: "pending" };
  check(true);
  return transaction(db, () => {
    check(true);
    const prior = event(db, `${key}:delivery`);
    if (prior) { same(prior); return { ...receipt, replayed: true, delivery: prior }; }
    // Synchronous bounded publisher verifies exact body + actor + destination.
    // If it crashes after POST, retry recovers the existing exact body.
    const result = publish(receipt);
    if (result?.verified !== true || !Number.isSafeInteger(result.comment_id) ||
        result.url !== `https://github.com/${request.repository}/issues/${request.issue}#issuecomment-${result.comment_id}`) fail("delivery_not_verified");
    const delivery = { ...result, identity, provider_execution_id: receipt.execution_binding.provider_execution_id };
    record(db, `${key}:delivery`, "cop/execution.delivery.v1", delivery);
    return { ...receipt, delivery };
  });
}

export function packetReceiptBody(receipt) {
  return `<!-- cop-packet-result:${receipt.execution_binding.provider_execution_id} -->\n\`\`\`json\n${JSON.stringify(receipt, null, 2)}\n\`\`\``;
}

export function publishPacketReceipt(receipt, { actor, run = spawnSync } = {}) {
  const gh = (args, input) => {
    const result = run("gh", ["api", ...args], { input, encoding: "utf8", timeout: 10000,
      maxBuffer: 2 * 1024 * 1024, killSignal: "SIGKILL", shell: false });
    if (result.status !== 0 || result.error) fail("callback_unavailable");
    return result.stdout;
  };
  if (!actor || gh(["user", "--jq", ".login"]).trim() !== actor) fail("callback_actor_mismatch");
  const endpoint = `repos/${receipt.repository}/issues/${receipt.issue}/comments`;
  const body = packetReceiptBody(receipt);
  // Bounded repair window. Refuse rather than POST when a full page could hide an older receipt.
  const comments = JSON.parse(gh([`${endpoint}?per_page=100`]));
  const prior = comments.find(c => c.user?.login === actor && c.body === body);
  if (!prior && comments.length === 100) fail("callback_reconciliation_window_full");
  const candidate = prior || JSON.parse(gh([endpoint, "--method", "POST", "--input", "-"], JSON.stringify({ body })));
  if (!Number.isSafeInteger(candidate.id)) fail("callback_identity_missing");
  const confirmed = JSON.parse(gh([`repos/${receipt.repository}/issues/comments/${candidate.id}`]));
  const url = `https://github.com/${receipt.repository}/issues/${receipt.issue}#issuecomment-${candidate.id}`;
  if (confirmed.id !== candidate.id || confirmed.body !== body || confirmed.user?.login !== actor || confirmed.html_url !== url) fail("callback_readback_mismatch");
  return { verified: true, url, comment_id: candidate.id, recovered: Boolean(prior) };
}
