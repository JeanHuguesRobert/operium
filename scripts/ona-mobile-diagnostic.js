import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { appendCopEvent, getCopEvent } from "../lib/node-agent/cop-events.js";
import { digest, requestDigest, fetchMobilePacket, executeMobilePacket,
  MOBILE_ISSUE, MOBILE_OPERATION } from "../lib/node-agent/mobile-diagnostic.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEY = "mobile:inseme-141-mobile-diagnostic-v1";
const ENDPOINT = "repos/JeanHuguesRobert/inseme/issues/141/comments";

export function residentSource(root = ROOT) {
  const files = ["scripts/ona-mobile-diagnostic.js", "lib/node-agent/mobile-diagnostic.js",
    "lib/node-agent/cop-events.js", "lib/node-agent/migrations/005_cop_events.sql",
    "../inseme/packages/cop-core/src/github-ingress.js", "../inseme/packages/magistral/src/execution.js"];
  const hashes = Object.fromEntries(files.map(file => [file, digest(fs.readFileSync(path.resolve(root, file)))]));
  const revision = cwd => {
    const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", timeout: 5000 });
    if (result.status !== 0) throw new Error("source_revision_unavailable");
    return result.stdout.trim();
  };
  return { operium_commit: revision(root), inseme_commit: revision(path.resolve(root, "../inseme")),
    implementation_sha256: digest(JSON.stringify(hashes)), files: hashes };
}

export function receiptComment(result) {
  return [
    `<!-- cop-mobile-resident-result:${result.execution_binding.provider_execution_id} -->`,
    "## Resident ONA mobile diagnostic receipt",
    "",
    "Produced by the Fracta ONA scheduled handler. GitHub input was API reconciliation; this is not a signed-webhook delivery. This authorized resident integration run uses its own retained Fracta store and is distinct from the earlier Termux run. The embedded delivery field preserves the execution-time outbox state.",
    "", "```json", JSON.stringify(result, null, 2), "```",
  ].join("\n");
}

// Existing gh authentication stays on Fracta. Never return raw process errors.
export function publishResidentReceipt(result, run = spawnSync) {
  const gh = (args, input) => {
    const value = run("gh", ["api", ...args], { input, encoding: "utf8", timeout: 15000,
      maxBuffer: 2 * 1024 * 1024, killSignal: "SIGKILL", shell: false });
    if (value.status !== 0 || value.error) throw new Error("github_receipt_delivery_unavailable");
    return value.stdout;
  };
  const actor = gh(["user", "--jq", ".login"]).trim();
  if (actor !== "JeanHuguesRobert") throw new Error("github_receipt_actor_mismatch");
  const body = receiptComment(result);
  const lines = gh([`${ENDPOINT}?per_page=100`, "--paginate", "--jq", ".[] | @json"]).trim();
  const comments = lines ? lines.split(/\r?\n/).map(line => JSON.parse(line)) : [];
  const prior = comments.find(comment => comment.user?.login === actor && comment.body === body);
  const candidate = prior || JSON.parse(gh([ENDPOINT, "--method", "POST", "--input", "-"], JSON.stringify({ body })));
  if (!Number.isSafeInteger(candidate.id)) throw new Error("github_receipt_identity_missing");
  const confirmed = JSON.parse(gh([`repos/JeanHuguesRobert/inseme/issues/comments/${candidate.id}`]));
  if (confirmed.body !== body || confirmed.user?.login !== actor || confirmed.id !== candidate.id ||
      confirmed.html_url !== `${MOBILE_ISSUE}#issuecomment-${candidate.id}`) {
    throw new Error("github_receipt_readback_mismatch");
  }
  return { url: confirmed.html_url, comment_id: confirmed.id, recovered: Boolean(prior) };
}

export function validateResidentPolicy(policy, source, now = Date.now()) {
  if (policy?.enabled !== true) return false;
  if (policy.schema !== "operium.mobile-diagnostic-policy/v1" || policy.issue !== MOBILE_ISSUE ||
      policy.operation !== MOBILE_OPERATION || policy.principal !== "JeanHuguesRobert" ||
      policy.execution !== true || policy.publish_receipt !== true ||
      typeof policy.authorization_ref !== "string" || !policy.authorization_ref.startsWith(MOBILE_ISSUE + "#issuecomment-") ||
      !/^[a-f0-9]{64}$/.test(policy.request_sha256 || "") ||
      policy.implementation_sha256 !== source.implementation_sha256 ||
      !Number.isFinite(Date.parse(policy.expires_at)) || Date.parse(policy.expires_at) <= now) {
    throw new Error("resident_mobile_policy_not_admitted");
  }
  return true;
}

export async function runResidentTick({ db, policy, source, fetchImpl,
  executePacket = executeMobilePacket, publish = publishResidentReceipt, now = Date.now() }) {
  if (!validateResidentPolicy(policy, source, now)) return { ok: true, skipped: "policy_disabled" };
  const delivered = getCopEvent(db, `${KEY}:delivery`);
  if (delivered) return { ok: true, replayed: true, delivery: delivered.envelope.payload };
  let result = getCopEvent(db, `${KEY}:result`)?.envelope.payload;
  if (!result) {
    const packet = await fetchMobilePacket({ fetchImpl, source });
    if (requestDigest(packet.request) !== policy.request_sha256) throw new Error("resident_request_not_authorized");
    result = executePacket(packet, { db, route: "fracta-local", authorization: {
      issue: MOBILE_ISSUE, operation: MOBILE_OPERATION, principal: policy.principal,
      execution: true, request_sha256: policy.request_sha256, basis: policy.authorization_ref,
    } });
  }
  if (!result.execution_receipt?.terminal) return { ok: false, error: "resident_execution_outcome_unknown" };
  // Serialize publication through the same retained store. If publication happened
  // before a crash, the next attempt recovers the exact GitHub body, not the SSH act.
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = getCopEvent(db, `${KEY}:delivery`);
    const delivery = existing?.envelope.payload || publish(result);
    if (!existing) appendCopEvent(db, { id: `${KEY}:delivery`, kind: "cop/execution.delivery.v1",
      payload: { ...delivery, provider_execution_id: result.execution_binding.provider_execution_id } });
    db.exec("COMMIT");
    return { ok: result.ok, delivery, execution_status: result.execution_receipt.status };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

// Reuse the already-deployed ONA script-job hook; no alternate daemon or timer.
export async function runScheduledHeartbeat({ env = process.env, fetch: fetchImpl } = {}) {
  const policyPath = env.ONA_MOBILE_141_POLICY;
  if (!policyPath) return { ok: true, skipped: "policy_not_configured" };
  let db;
  try {
    const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
    if (policy.enabled !== true) return { ok: true, skipped: "policy_disabled" };
    if (Date.parse(policy.expires_at) <= Date.now()) return { ok: true, skipped: "policy_expired" };
    const source = residentSource();
    validateResidentPolicy(policy, source);
    if (!path.isAbsolute(policy.db_path || "") || policy.db_path === ":memory:") throw new Error("durable_store_required");
    fs.mkdirSync(path.dirname(policy.db_path), { recursive: true });
    db = new DatabaseSync(policy.db_path);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000;");
    db.exec(fs.readFileSync(new URL("../lib/node-agent/migrations/005_cop_events.sql", import.meta.url), "utf8"));
    return await runResidentTick({ db, policy, source, fetchImpl });
  } catch {
    return { ok: false, error: "resident_mobile_tick_failed", detail: "Check admission, claim/receipt and delivery state; raw errors withheld." };
  } finally { db?.close(); }
}
