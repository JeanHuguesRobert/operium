import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { appendCopEvent, getCopEvent } from "./cop-events.js";
import { mapDeliveryToCopEvent } from "../../../inseme/packages/cop-core/src/github-ingress.js";
import { createExecutionBinding, createExecutionReceipt } from "../../../inseme/packages/magistral/src/execution.js";

export const MOBILE_ISSUE = "https://github.com/JeanHuguesRobert/inseme/issues/141";
export const MOBILE_OPERATION = "mobile.termux.diagnostic/v1";
const REPOSITORY = "JeanHuguesRobert/inseme";
const COMPUTATION = "inseme-141-mobile-diagnostic-v1";
const SSH_OPTIONS = ["-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
  "-o", "UpdateHostKeys=no", "-o", "ConnectTimeout=5", "-o", "ForwardAgent=no",
  "-o", "ClearAllForwardings=yes"];
const MOBILE_ARGS = [...SSH_OPTIONS, "-p", "8022", "u0_a393@poco-jhr", "whoami && git --version"];
export const digest = value => crypto.createHash("sha256").update(value).digest("hex");
// GitHub bumps updated_at for comments, including our receipt projection.
export const requestDigest = request => digest(JSON.stringify({ ...request,
  provenance: { ...request.provenance, issue_updated_at: null } }));

// The Issue is context, never shell or an authorization token. This deliberately
// bounded profile consumes one named packet; a generic consumer is a later mandate.
export function prepareMobilePacket(issue, { source, observedAt = new Date().toISOString() } = {}) {
  if (issue?.number !== 141 || issue.html_url !== MOBILE_ISSUE || issue.pull_request ||
      issue.user?.login !== "JeanHuguesRobert" || issue.state !== "open" ||
      typeof issue.body !== "string" || !issue.body.trim() || !Number.isFinite(Date.parse(issue.updated_at))) {
    throw new Error("mobile_issue_not_admitted");
  }
  if (!source || !/^[a-f0-9]{64}$/.test(source.implementation_sha256 || "")) {
    throw new Error("implementation_identity_required");
  }
  const bodyHash = digest(issue.body);
  const event = mapDeliveryToCopEvent({
    delivery_id: `api-reconcile:issue-141:${bodyHash}`,
    repository_name: REPOSITORY, sender_login: issue.user.login,
    event_name: "issues", action: "observed", payload_sha256: bodyHash,
    received_at: observedAt,
  }, { issue });
  event.meta.transport = "github-api-reconciliation";
  event.meta.webhook_verified = false;
  const request = {
    schema: "cop.compute-request/v1", computation_id: COMPUTATION,
    capability: MOBILE_OPERATION, operation: { kind: MOBILE_OPERATION, target: "poco-jhr" },
    limits: { timeout_seconds: 15, network: "ssh:fracta:poco-jhr:8022", repository_write: false },
    return: { github_issue: 141, structured_result: true },
    provenance: { issue: MOBILE_ISSUE, issue_updated_at: issue.updated_at, body_sha256: bodyHash,
      transport: "github-api-reconciliation" },
  };
  return { request, event, source, observed_at: observedAt };
}

export async function fetchMobilePacket({ fetchImpl = globalThis.fetch, source } = {}) {
  const response = await fetchImpl(`https://api.github.com/repos/${REPOSITORY}/issues/141`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "operium-mobile-diagnostic" },
    signal: AbortSignal.timeout(10000), redirect: "error",
  });
  if (!response.ok) throw new Error(`github_issue_read_http_${response.status}`);
  return prepareMobilePacket(await response.json(), { source });
}

export function mobileSshInvocation(route, hostname = os.hostname()) {
  if (route === "fracta-local") {
    if (hostname !== "fracta") throw new Error("fracta_local_requires_fracta");
    return { command: "ssh", args: MOBILE_ARGS, timeout: 15000 };
  }
  if (route !== "via-fracta") throw new Error("mobile_route_not_allowed");
  // Every shell byte below is a source constant, never derived from GitHub.
  const remote = "timeout --signal=KILL 15s ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o ConnectTimeout=5 -o ForwardAgent=no -o ClearAllForwardings=yes -p 8022 u0_a393@poco-jhr 'whoami && git --version'";
  return { command: "ssh", args: [...SSH_OPTIONS, "fracta", remote], timeout: 20000 };
}

export function filterMobileOutput(execution) {
  const lines = String(execution.stdout || "").trim().split(/\r?\n/);
  const valid = lines.length === 2 && lines[0] === "u0_a393" && /^git version \d+\.\d+\.\d+(?:[.a-zA-Z0-9-]{0,40})?$/.test(lines[1]);
  return { valid, stdout: valid ? lines.join("\n") + "\n" : "",
    stderr: execution.stderr ? "[remote stderr withheld]" : "" };
}

export function executeMobilePacket(packet, { db, authorization, route = "via-fracta",
  execute = spawnSync, now = () => new Date().toISOString(), hostname = os.hostname(),
  simulation = false } = {}) {
  // Reconstruct the fixed request to reject changes, including extra shell fields.
  const expected = prepareMobilePacket({ number: 141, html_url: MOBILE_ISSUE,
    user: { login: "JeanHuguesRobert" }, state: "open", body: "validation",
    updated_at: packet?.request?.provenance?.issue_updated_at }, { source: packet?.source }).request;
  expected.provenance.body_sha256 = packet?.request?.provenance?.body_sha256;
  if (!/^[a-f0-9]{64}$/.test(expected.provenance.body_sha256 || "") ||
      JSON.stringify(expected) !== JSON.stringify(packet.request)) throw new Error("mobile_request_not_allowlisted");
  const requestHash = requestDigest(packet.request);
  if (authorization?.issue !== MOBILE_ISSUE || authorization.operation !== MOBILE_OPERATION ||
      authorization.request_sha256 !== requestHash || authorization.execution !== true ||
      authorization.principal !== "JeanHuguesRobert") throw new Error("explicit_mobile_authorization_required");
  if (!db) throw new Error("durable_cop_store_required");
  const invocation = mobileSshInvocation(route, hostname);
  const key = `mobile:${COMPUTATION}${simulation ? ":simulation" : ""}`;
  const previous = getCopEvent(db, `${key}:claim`);
  if (previous) {
    if (previous.envelope.payload.request_sha256 !== requestHash) throw new Error("mobile_request_identity_conflict");
    const result = getCopEvent(db, `${key}:result`);
    return result ? { ...result.envelope.payload, replayed: true } : {
      ok: false, status: "needs_acceptance", error: "claimed_execution_outcome_unknown",
      execution_binding: previous.envelope.payload.execution_binding,
    };
  }
  const runId = crypto.randomUUID();
  const started = now();
  const binding = createExecutionBinding({ requirement_ref: `requirement:compute-request:${COMPUTATION}`,
    offer_id: "offer:ona:mobile-termux-diagnostic-v1", runtime_id: `runtime:ona:${hostname}`,
    handler_instance_ref: `handler:ona:${runId}`, execution_surface: "batch",
    provider_ref: simulation ? "provider:simulation" : "provider:ssh:fracta",
    provider_execution_id: runId });
  // BEGIN IMMEDIATE serializes independent handlers. Claim remains after a crash;
  // absence of a receipt never authorizes an automatic second SSH invocation.
  db.exec("BEGIN IMMEDIATE");
  try {
    if (getCopEvent(db, `${key}:claim`)) throw new Error("mobile_execution_claimed_concurrently");
    appendCopEvent(db, { id: `${key}:ingress`, kind: "cop/github.observed.v1", payload: { event: packet.event } });
    appendCopEvent(db, { id: `${key}:claim`, kind: "cop/execution.bound.v1", created_at: started,
      payload: { request: packet.request, request_sha256: requestHash, authorization,
        execution_binding: binding, source: packet.source, route, simulation } });
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  let execution;
  try {
    execution = execute(invocation.command, invocation.args, { encoding: "utf8", timeout: invocation.timeout,
      killSignal: "SIGKILL", maxBuffer: 8192, stdio: ["ignore", "pipe", "pipe"], shell: false });
  } catch { execution = { status: null, error: { code: "PROVIDER_ERROR" } }; }
  const filtered = filterMobileOutput(execution);
  const timedOut = execution.error?.code === "ETIMEDOUT" || [124, 137].includes(execution.status);
  const ok = execution.status === 0 && !execution.error && filtered.valid;
  const status = ok ? "completed" : timedOut ? "timed_out" : "failed";
  const error = ok ? null : timedOut ? "mobile_diagnostic_timeout" : "mobile_diagnostic_failed_or_unexpected_output";
  const receipt = createExecutionReceipt({ binding, status, error,
    result_refs: [`cop-event:${key}:result`], log_refs: [`cop-event:${key}:result`] });
  const result = { schema: "cop.compute-result/v1", computation_id: COMPUTATION, ok,
    simulation, attempted: true, route, source: packet.source, provenance: packet.request.provenance,
    authorization, started_at: started, finished_at: now(),
    result: { operation: MOBILE_OPERATION, target: "poco-jhr", exit_code: execution.status ?? null,
      signal: execution.signal || null, ...filtered },
    execution_binding: binding, execution_receipt: receipt, delivery: "pending" };
  appendCopEvent(db, { id: `${key}:result`, kind: "cop/execution.receipt.v1", payload: result });
  return result;
}
