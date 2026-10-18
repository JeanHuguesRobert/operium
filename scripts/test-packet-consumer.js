import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "../lib/node-agent/migrate.js";
import { getCopEvent } from "../lib/node-agent/cop-events.js";
import { canonical, hash, packetKey, parseIssue, validatePacket, defaultProviders,
  consumePacket, packetReceiptBody, publishPacketReceipt } from "../lib/node-agent/packet-consumer.js";
import { runConsumerTick, runScheduledHeartbeat, consumerSource } from "./ona-packet-consumer.js";

// All authority and transport fixtures are ephemeral and simulated; no subprocess runs.
const repository = "test-owner/test-repo";
const instant = Date.parse("2026-10-18T12:00:00Z");
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "packet-consumer-test-"));
  const filename = path.join(directory, "events.sqlite");
  let db;
  function reopen() {
    db?.close();
    db = new DatabaseSync(filename);
    runMigrations(db, { seedLocalState: false });
    return db;
  }
  reopen();
  t.after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const keys = crypto.generateKeyPairSync("ed25519");
  const source = { implementation_sha256: hash("test implementation") };
  const policy = { enabled: true, repositories: [repository], revoked_grants: [],
    issuers: { fixture: { principal: "fixture-principal", public_key: keys.publicKey.export({ type: "spki", format: "pem" }) } } };
  const calls = [];
  const providers = defaultProviders({ hostname: "fracta", simulation: true, execute: (...args) => {
    calls.push(args); return { status: 0, stdout: "u0_a393\ngit version 2.47.0\n", stderr: "" };
  } });
  function packet(id = "request-1", kind = "local.sha256/v1") {
    const request = { schema: "operium.packet-request/v1", id, repository, issue: 165,
      operation: kind === "local.sha256/v1" ? { kind, text: `input:${id}` } : { kind, target: "poco-jhr" },
      timeout_ms: 500, return: { github_issue: 165 } };
    return parseIssue({ number: 165, state: "open", html_url: `https://github.com/${repository}/issues/165`,
      user: { login: "untrusted-author" }, body: `Context\n\`\`\`json\n${JSON.stringify(request)}\n\`\`\`` }, repository);
  }
  function sign(packet, overrides = {}) {
    const provider = providers[packet.request.operation.kind];
    const grant = { schema: "operium.packet-grant/v1", id: `grant:${packet.request.id}`, issuer: "fixture",
      principal: "fixture-principal", request_sha256: hash(packet.request), implementation_sha256: source.implementation_sha256,
      provider_ref: provider.id, control_ref: provider.control_ref, effect_ceiling: "read-only", max_executions: 1,
      execution: true, timeout_ms: packet.request.timeout_ms, simulation: true, publish_receipt: true,
      not_before: new Date(instant - 1000).toISOString(), expires_at: new Date(instant + 60000).toISOString(), ...overrides };
    return { grant, signature: crypto.sign(null, Buffer.from(canonical(grant)), keys.privateKey).toString("base64") };
  }
  function consume(packet, options = {}) {
    return consumePacket({ db, packet, source, policy, providers, now: () => instant,
      runtime: "fixture", signedGrant: sign(packet), ...options });
  }
  return { get db() { return db; }, filename, directory, reopen, source, policy, providers, calls, packet, sign, consume };
}
const delivered = receipt => ({ verified: true, comment_id: 42,
  url: `https://github.com/${receipt.repository}/issues/${receipt.issue}#issuecomment-42` });

test("multiple packet identities select two providers and preserve execution receipts across cold replay", t => {
  const f = fixture(t);
  const packets = [f.packet("a"), f.packet("b"), f.packet("c", "mobile.termux.diagnostic/v1")];
  const results = packets.map(packet => f.consume(packet, { publish: delivered }));
  assert.equal(new Set(results.map(r => r.execution_binding.provider_execution_id)).size, 3);
  assert.equal(new Set(results.map(r => r.execution_binding.provider_ref)).size, 2);
  assert.equal(results[0].output.sha256, hash("input:a"));
  assert.equal(results[2].output.stdout, "u0_a393\ngit version 2.47.0\n");
  assert.ok(results.every(r => r.ok && r.simulation && r.delivery.verified));
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0], "ssh");
  assert.equal(f.calls[0][2].shell, false);
  assert.equal(f.calls[0][2].timeout, 500);
  f.reopen();
  packets.forEach((packet, index) => {
    const result = f.consume(packet, { publish: () => assert.fail("must not redeliver") });
    assert.equal(result.replayed, true);
    assert.deepEqual(result.execution_binding, results[index].execution_binding);
  });
  assert.equal(f.calls.length, 1);
});

test("untrusted authors, missing/forged/expired grants and revoked grants cannot authorize execution", t => {
  const f = fixture(t), packet = f.packet("authority");
  assert.throws(() => f.consume(packet, { signedGrant: null }), /grant_required/);
  const forged = f.sign(packet); forged.grant.principal = "attacker";
  assert.throws(() => f.consume(packet, { signedGrant: forged }), /untrusted_principal/);
  const modified = f.sign(packet); modified.grant.execution = false;
  assert.throws(() => f.consume(packet, { signedGrant: modified }), /invalid_grant_signature/);
  assert.throws(() => f.consume(packet, { signedGrant: f.sign(packet, { expires_at: new Date(instant).toISOString() }) }), /grant_not_admitted/);
  assert.throws(() => f.consume(packet, { signedGrant: f.sign(packet, { not_before: new Date(instant + 1).toISOString() }) }), /grant_not_admitted/);
  f.policy.revoked_grants.push("grant:authority");
  assert.throws(() => f.consume(packet), /grant_revoked/);
  f.policy.revoked_grants = [];
  f.reopen();
  assert.throws(() => f.consume(packet), /grant_revoked/);
  assert.equal(getCopEvent(f.db, `${packetKey(packet.request)}:claim`), null);
});

test("extra shell/authority/return fields are rejected before provider selection", t => {
  const f = fixture(t);
  for (const mutate of [r => { r.command = "echo injected"; }, r => { r.operation.command = "echo injected"; },
    r => { r.return.repository = "attacker/repo"; }, r => { r.grant = {}; }, r => { r.return.github_issue = 166; }]) {
    const packet = f.packet(); mutate(packet.request);
    assert.throws(() => validatePacket(packet.request), /invalid_fields|return_target_mismatch/);
  }
  assert.equal(f.calls.length, 0);
});

test("validly re-signed changed content or implementation cannot reuse a queued identity", t => {
  const f = fixture(t), packet = f.packet("conflict");
  f.consume(packet);
  const changed = structuredClone(packet); changed.request.operation.text = "changed";
  assert.throws(() => f.consume(changed), /packet_identity_conflict/);
  const source = { implementation_sha256: hash("new source") };
  assert.throws(() => f.consume(packet, { source }), /grant_not_admitted/);
  assert.throws(() => f.consume(packet, { source,
    signedGrant: f.sign(packet, { implementation_sha256: source.implementation_sha256 }) }), /packet_identity_conflict/);
});

test("unavailable route queues without consuming execution budget", t => {
  const f = fixture(t), packet = f.packet("route", "mobile.termux.diagnostic/v1");
  const providers = defaultProviders({ hostname: "elsewhere", simulation: true, execute: () => assert.fail("no route") });
  assert.deepEqual(f.consume(packet, { providers }), { ok: false, status: "queued", error: "provider_unavailable" });
  assert.equal(getCopEvent(f.db, `${packetKey(packet.request)}:claim`), null);
  assert.equal(getCopEvent(f.db, "packet:grant-spent:grant:route"), null);
  assert.equal(f.consume(packet).ok, true);
  assert.equal(f.calls.length, 1);
});

test("timeout is a durable terminal outcome and never repeats the mobile effect", t => {
  const f = fixture(t), packet = f.packet("timeout", "mobile.termux.diagnostic/v1");
  let attempts = 0;
  const providers = defaultProviders({ hostname: "fracta", simulation: true, execute: () => {
    attempts++; return { status: null, error: { code: "ETIMEDOUT" }, stdout: "secret partial output", stderr: "secret" };
  } });
  const result = f.consume(packet, { providers });
  assert.equal(result.execution_receipt.status, "timed_out");
  assert.equal(result.ok, false);
  assert.equal(result.output.stdout, "");
  assert.equal(result.output.stderr, "[remote stderr withheld]");
  f.reopen(); f.consume(packet, { providers });
  assert.equal(attempts, 1);
});

test("orphaned durable claim requires acceptance after cold reopening", t => {
  const f = fixture(t), packet = f.packet("orphan", "mobile.termux.diagnostic/v1");
  assert.throws(() => f.consume(packet, { beforeExecute: () => { throw new Error("simulated crash"); } }), /simulated crash/);
  f.reopen();
  const result = f.consume(packet);
  assert.equal(result.status, "needs_acceptance");
  assert.equal(result.error, "claimed_execution_outcome_unknown");
  assert.equal(f.calls.length, 0);
});

test("revocation immediately before the effect prevents provider execution", t => {
  const f = fixture(t), packet = f.packet("late-revoke", "mobile.termux.diagnostic/v1");
  const result = f.consume(packet, { beforeExecute: () => f.policy.revoked_grants.push("grant:late-revoke") });
  assert.equal(result.ok, false);
  assert.equal(result.execution_receipt.status, "failed");
  assert.equal(f.calls.length, 0);
});

test("callback failure retries only delivery and checks publication authority", t => {
  const f = fixture(t), packet = f.packet("callback", "mobile.termux.diagnostic/v1");
  assert.throws(() => f.consume(packet, { publish: () => { throw new Error("offline"); } }), /offline/);
  assert.equal(getCopEvent(f.db, `${packetKey(packet.request)}:delivery`), null);
  assert.ok(getCopEvent(f.db, `${packetKey(packet.request)}:result`));
  f.reopen();
  assert.throws(() => f.consume(packet, { signedGrant: f.sign(packet, { publish_receipt: false }), publish: delivered }), /delivery_not_authorized/);
  assert.throws(() => f.consume(packet, { publish: () => ({ ...delivered({ repository, issue: 166 }) }) }), /delivery_not_verified/);
  const result = f.consume(packet, { publish: delivered });
  assert.equal(result.delivery.verified, true);
  assert.equal(f.calls.length, 1);
});

test("callback readback checks exact actor/body/destination and recovers a previous POST", t => {
  const f = fixture(t), receipt = f.consume(f.packet("readback"));
  const actor = "fixture-bot", body = packetReceiptBody(receipt);
  const comment = { id: 42, user: { login: actor }, body, html_url: delivered(receipt).url };
  function transport({ prior = [], confirmed = comment, login = actor } = {}) {
    const calls = [];
    const run = (command, args, options) => {
      assert.equal(command, "gh"); assert.equal(options.shell, false);
      calls.push(args);
      let value;
      if (args[1] === "user") return { status: 0, stdout: login };
      if (args[1].includes("?per_page")) value = prior;
      else if (args.includes("POST")) { assert.deepEqual(JSON.parse(options.input), { body }); value = comment; }
      else value = confirmed;
      return { status: 0, stdout: JSON.stringify(value) };
    };
    return { run, calls };
  }
  const fresh = transport();
  assert.equal(publishPacketReceipt(receipt, { actor, run: fresh.run }).verified, true);
  assert.equal(fresh.calls.filter(c => c.includes("POST")).length, 1);
  const recovered = transport({ prior: [comment] });
  assert.equal(publishPacketReceipt(receipt, { actor, run: recovered.run }).recovered, true);
  assert.equal(recovered.calls.filter(c => c.includes("POST")).length, 0);
  for (const confirmed of [{ ...comment, body: "edited" }, { ...comment, user: { login: "attacker" } },
    { ...comment, html_url: "https://github.com/attacker/repo/issues/1#issuecomment-42" }]) {
    assert.throws(() => publishPacketReceipt(receipt, { actor, run: transport({ confirmed }).run }), /callback_readback_mismatch/);
  }
  assert.throws(() => publishPacketReceipt(receipt, { actor, run: transport({ login: "attacker" }).run }), /callback_actor_mismatch/);
  assert.throws(() => publishPacketReceipt(receipt, { actor, run: transport({ prior: Array.from({ length: 100 }, () => ({ body: "other" })) }).run }), /callback_reconciliation_window_full/);
});

test("strict identifiers and simulated mobile default never start real SSH", t => {
  const f = fixture(t), request = f.packet().request;
  assert.throws(() => validatePacket({ ...request, id: ["abc"] }), /invalid_request/);
  assert.throws(() => defaultProviders({ simulation: true, hostname: "fracta" })["mobile.termux.diagnostic/v1"].run(
    f.packet("mobile", "mobile.termux.diagnostic/v1").request), /simulation_requires_fake_executor/);
});

test("two independent worker processes sharing the retained store execute only once", async t => {
  const f = fixture(t), packet = f.packet("competing");
  const setup = path.join(f.directory, "worker.json");
  const effects = path.join(f.directory, "effects.txt");
  fs.writeFileSync(setup, JSON.stringify({ filename: f.filename, packet, policy: f.policy, source: f.source,
    signedGrant: f.sign(packet), instant, effects }));
  const moduleUrl = new URL("../lib/node-agent/packet-consumer.js", import.meta.url).href;
  const worker = `import fs from 'node:fs'; import { DatabaseSync } from 'node:sqlite';
    import { consumePacket, defaultProviders } from ${JSON.stringify(moduleUrl)};
    const x = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const db = new DatabaseSync(x.filename); db.exec('PRAGMA busy_timeout=5000');
    const providers = defaultProviders({simulation:true});
    providers['local.sha256/v1'].run = () => { fs.appendFileSync(x.effects, 'execution\\n');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150); return {status:'completed',output:{}}; };
    try { console.log(JSON.stringify(consumePacket({...x, db, providers, now:()=>x.instant}))); }
    catch(e) { if(e.message !== 'claim_contended') throw e; console.log(JSON.stringify({error:e.message})); }
    finally { db.close(); }`;
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", worker, setup], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "", error = "";
    child.stdout.on("data", bytes => { output += bytes; }); child.stderr.on("data", bytes => { error += bytes; });
    child.on("error", reject); child.on("close", code => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error)));
  });
  const results = await Promise.all([run(), run()]);
  assert.equal(fs.readFileSync(effects, "utf8"), "execution\n");
  assert.ok(results.some(result => result.ok));
});

test("bounded multi-issue API tick survives unauthorized and failed callbacks, then cold retries only delivery", async t => {
  const f = fixture(t), first = f.packet("tick-a"), second = f.packet("tick-b", "mobile.termux.diagnostic/v1");
  second.request.issue = 166; second.request.return.github_issue = 166;
  const denied = f.packet("tick-denied"); denied.request.issue = 167; denied.request.return.github_issue = 167;
  const packets = [denied, first, second];
  Object.assign(f.policy, { schema: "operium.packet-consumer-policy/v1", requests: packets.map(packet => ({
    repository, issue: packet.request.issue, id: packet.request.id, signed_grant: packet === denied ? null : f.sign(packet) })) });
  let fetches = 0, callbacks = 0;
  const options = { db: f.db, policy: f.policy, source: f.source, providers: f.providers, now: () => instant,
    fetchImpl: async url => {
      fetches++;
      const packet = packets.find(p => url.endsWith(`/${p.request.issue}`));
      return { ok: true, json: async () => ({ number: packet.request.issue, state: "open",
        html_url: `https://github.com/${repository}/issues/${packet.request.issue}`,
        body: `\`\`\`json\n${JSON.stringify(packet.request)}\n\`\`\`` }) };
    }, publish: () => { callbacks++; throw new Error("callback_unavailable"); } };
  const initial = await runConsumerTick(options);
  assert.equal(initial.ok, false); assert.equal(initial.results.length, 3);
  assert.equal(callbacks, 2); assert.equal(f.calls.length, 1);
  f.reopen();
  f.policy.requests.shift();
  const repaired = await runConsumerTick({ ...options, db: f.db, publish: delivered,
    fetchImpl: () => assert.fail("durable outbox should not refetch") });
  assert.equal(repaired.ok, true); assert.equal(f.calls.length, 1); assert.equal(fetches, 3);
  assert.equal((await runConsumerTick({ ...options, db: f.db, policy: { enabled: false } })).skipped, "policy_disabled");
});

test("scheduled adapter is disabled without policy, refuses missing stores and exposes source identity", async t => {
  const f = fixture(t);
  assert.equal((await runScheduledHeartbeat({ env: {} })).skipped, "policy_not_configured");
  const file = path.join(f.directory, "disabled.json");
  fs.writeFileSync(file, JSON.stringify({ enabled: false }));
  assert.equal((await runScheduledHeartbeat({ env: { ONA_PACKET_CONSUMER_POLICY: file } })).skipped, "policy_disabled");
  fs.writeFileSync(file, JSON.stringify({ enabled: true, db_path: path.join(f.directory, "missing.sqlite") }));
  assert.equal((await runScheduledHeartbeat({ env: { ONA_PACKET_CONSUMER_POLICY: file } })).ok, false);
  assert.equal(fs.existsSync(path.join(f.directory, "missing.sqlite")), false);
  assert.match(consumerSource().implementation_sha256, /^[a-f0-9]{64}$/);
});
