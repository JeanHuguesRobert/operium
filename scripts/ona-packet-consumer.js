// Opt-in existing ONA script job. No daemon, default job, key generation or grant issuance.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { hash, parseIssue, packetKey, consumePacket, defaultProviders, publishPacketReceipt } from "../lib/node-agent/packet-consumer.js";
import { appendCopEvent, getCopEvent } from "../lib/node-agent/cop-events.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function consumerSource(root = ROOT) {
  const files = ["scripts/ona-packet-consumer.js", "scripts/service-check-worker.js", "lib/node-agent/packet-consumer.js", "lib/node-agent/mobile-diagnostic.js",
    "lib/node-agent/cop-events.js", "lib/node-agent/migrations/005_cop_events.sql",
    "../inseme/packages/cop-core/src/github-ingress.js", "../inseme/packages/cop-core/src/continuation-result.js",
    "../inseme/packages/magistral/src/execution.js"];
  const hashes = Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.resolve(root, file), "utf8"))]));
  const revision = cwd => {
    const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", timeout: 5000, shell: false });
    if (result.status !== 0) throw new Error("source_revision_unavailable");
    return result.stdout.trim();
  };
  return { operium_commit: revision(root), inseme_commit: revision(path.resolve(root, "../inseme")),
    implementation_sha256: hash(hashes), files: hashes };
}
// ONA caches imported job modules. Never label old loaded code with new disk hashes.
const loadedSource = consumerSource();

export async function runConsumerTick({ db, policy, source, fetchImpl = globalThis.fetch,
  providers = defaultProviders(), publish, now = Date.now } = {}) {
  const current = () => typeof policy === "function" ? policy() : policy;
  const config = current();
  if (config?.enabled !== true) return { ok: true, skipped: "policy_disabled" };
  if (config.schema !== "operium.packet-consumer-policy/v1" || !Array.isArray(config.requests) ||
      config.requests.length > 8 || !Array.isArray(config.repositories) || !config.issuers ||
      !Array.isArray(config.revoked_grants)) throw new Error("invalid_consumer_policy");
  const results = [];
  let apiReads = 0;
  for (const item of config.requests) {
    const repairKey = `packet-repair:${hash([item.repository, item.issue, item.id, item.signed_grant || null])}`;
    const repairRow = db.prepare("SELECT envelope_json FROM cop_events WHERE kind = 'cop/packet.repair.v1' AND obligation_id = ? ORDER BY seq DESC LIMIT 1").get(repairKey);
    const repair = repairRow ? JSON.parse(repairRow.envelope_json).payload : null;
    if (repair?.retry_at > now()) {
      results.push({ id: item.id, ok: false, status: "deferred", error: "repair_backoff", retry_at: repair.retry_at });
      continue;
    }
    const defer = reason => {
      const attempt = Math.min((repair?.attempt || 0) + 1, 6);
      const retry_at = now() + Math.min(30000 * 2 ** (attempt - 1), 900000);
      appendCopEvent(db, { id: `${repairKey}:${randomUUID()}`, kind: "cop/packet.repair.v1",
        payload: { attempt, retry_at, reason } }, { obligation_id: repairKey });
    };
    try {
      // Trusted local configuration scopes API reads, never Issue-provided URLs.
      if (!config.repositories.includes(item.repository) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(item.repository || "") ||
          !Number.isSafeInteger(item.issue) || item.issue < 1 ||
          (typeof item.id !== "string" && item.follow_issue !== true)) throw new Error("invalid_discovery_target");
      if (item.follow_issue === true && item.signed_grant?.grant?.schema !== "operium.service-check-grant/v1")
        throw new Error("grant_follow_issue_not_admitted");
      // Persisted receipts can be delivered without fetching GitHub work again.
      // consumePacket still rechecks signed authority, source and complete identity.
      let key = packetKey(item);
      let queued = getCopEvent(db, `${key}:queued`)?.envelope.payload;
      if (item.follow_issue === true) {
        // Finish an already executed callback before observing the next request.
        // A changed Issue must not abandon an immutable pending receipt.
        const pending = db.prepare(`SELECT q.envelope_json FROM cop_events q
          JOIN cop_events r ON r.id = substr(q.id, 1, length(q.id)-7) || ':result'
          LEFT JOIN cop_events d ON d.id = substr(q.id, 1, length(q.id)-7) || ':delivery'
          WHERE q.kind = 'cop/packet.queued.v1' AND d.id IS NULL
          AND json_extract(q.envelope_json, '$.payload.request.repository') = ?
          AND json_extract(q.envelope_json, '$.payload.request.issue') = ?
          ORDER BY q.seq LIMIT 1`).get(item.repository, item.issue);
        queued = pending ? JSON.parse(pending.envelope_json).payload : null;
        if (queued) key = packetKey(queued.request);
      }
      let packet;
      if (queued && getCopEvent(db, `${key}:result`)) packet = { request: queued.request };
      else {
        apiReads++;
        const response = await fetchImpl(`https://api.github.com/repos/${item.repository}/issues/${item.issue}`, {
          headers: { Accept: "application/vnd.github+json", "User-Agent": "operium-packet-consumer" },
          signal: AbortSignal.timeout(5000), redirect: "error" });
        if (!response.ok) throw new Error("github_read_failed");
        packet = parseIssue(await response.json(), item.repository);
        if ((item.follow_issue !== true && packet.request.id !== item.id) || packet.request.issue !== item.issue) throw new Error("discovery_identity_mismatch");
      }
      // Refresh the grant and revocation source after the network wait.
      const freshItem = current().requests?.find(value => value.repository === item.repository && value.issue === item.issue &&
        value.id === item.id && value.follow_issue === item.follow_issue);
      const result = consumePacket({ db, packet, signedGrant: freshItem?.signed_grant, policy, source, providers, now,
        publish: publish || (receipt => publishPacketReceipt(receipt, { actor: current().callback_actor })) });
      results.push({ id: packet.request.id, ok: result.ok, status: result.execution_receipt?.status || result.status,
        error: result.error || null, delivery: result.delivery || null });
      if (!result.ok) defer(result.error || result.execution_receipt?.status || "pending");
    } catch (error) {
      // Never return raw provider/authentication/JSON errors to operational logs.
      const known = /^(grant_|service_catalogue_changed|service_runtime_mismatch|invalid_grant_signature|untrusted_principal|packet_identity_conflict|claimed_execution_outcome_unknown|claim_contended|callback_|delivery_|provider_unavailable)/.test(error.message);
      results.push({ id: item.id, ok: false, error: known ? error.message : "packet_tick_failed" });
      defer(known ? error.message : "packet_tick_failed");
    }
  }
  return { ok: results.every(result => result.ok), results,
    control: { api_read_attempts: apiReads, provider_quota_remaining: "not_estimated" } };
}

export async function runScheduledHeartbeat({ env = process.env, fetch: fetchImpl } = {}) {
  if (!env.ONA_PACKET_CONSUMER_POLICY) return { ok: true, skipped: "policy_not_configured" };
  let db;
  try {
    const policy = () => JSON.parse(fs.readFileSync(env.ONA_PACKET_CONSUMER_POLICY, "utf8"));
    const config = policy();
    if (config.enabled !== true) return { ok: true, skipped: "policy_disabled" };
    if (!path.isAbsolute(config.db_path || "") || config.db_path === ":memory:") throw new Error("durable_store_required");
    // Creating a different store must be an explicit operator act, never silent recovery.
    if (!fs.existsSync(config.db_path)) throw new Error("retained_store_missing");
    const source = consumerSource();
    if (source.implementation_sha256 !== loadedSource.implementation_sha256) throw new Error("loaded_source_changed");
    db = new DatabaseSync(config.db_path);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000;");
    db.exec(fs.readFileSync(new URL("../lib/node-agent/migrations/005_cop_events.sql", import.meta.url), "utf8"));
    return await runConsumerTick({ db, policy, source, fetchImpl,
      providers: defaultProviders({ serviceChecks: config.service_checks || {} }) });
  } catch { return { ok: false, error: "packet_consumer_unavailable" }; }
  finally { db?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const command = process.argv[2];
  if (command === "inspect") console.log(JSON.stringify({ source: consumerSource(),
    configured: Boolean(process.env.ONA_PACKET_CONSUMER_POLICY), activation: "opt-in; independent signed grants required" }, null, 2));
  else if (command === "tick") {
    const result = await runScheduledHeartbeat();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } else { console.error("Usage: node scripts/ona-packet-consumer.js inspect|tick"); process.exitCode = 2; }
}
