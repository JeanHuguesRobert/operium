import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { requestDigest, digest, prepareMobilePacket, fetchMobilePacket, executeMobilePacket,
  mobileSshInvocation, filterMobileOutput, MOBILE_ISSUE, MOBILE_OPERATION } from "../lib/node-agent/mobile-diagnostic.js";
import { appendCopEvent } from "../lib/node-agent/cop-events.js";

const source = { implementation_sha256: "a".repeat(64) };
const issue = { number: 141, html_url: MOBILE_ISSUE, user: { login: "JeanHuguesRobert" },
  state: "open", updated_at: "2026-10-10T09:27:16Z", body: "Do not execute this prose: $(touch /tmp/unsafe)" };
const packet = () => prepareMobilePacket(issue, { source });
const auth = p => ({ issue: MOBILE_ISSUE, operation: MOBILE_OPERATION, principal: "JeanHuguesRobert",
  execution: true, request_sha256: requestDigest(p.request) });
function database(file = ":memory:") {
  const db = new DatabaseSync(file);
  db.exec(fs.readFileSync(new URL("../lib/node-agent/migrations/005_cop_events.sql", import.meta.url), "utf8"));
  return db;
}
const success = () => ({ status: 0, stdout: "u0_a393\ngit version 2.56.0\n", stderr: "" });

test("API adapter identifies reconciliation and rejects wrong source", async () => {
  const p = await fetchMobilePacket({ source, fetchImpl: async url => {
    assert.equal(url, "https://api.github.com/repos/JeanHuguesRobert/inseme/issues/141");
    return { ok: true, json: async () => issue };
  } });
  assert.equal(p.event.meta.transport, "github-api-reconciliation");
  assert.equal(p.event.meta.webhook_verified, false);
  for (const change of [{ number: 120 }, { state: "closed" }, { user: { login: "other" } }, { pull_request: {} }]) {
    assert.throws(() => prepareMobilePacket({ ...issue, ...change }, { source }), /not_admitted/);
  }
});

test("authority and operation fail closed before execution", () => {
  const db = database(); const p = packet(); let calls = 0;
  const execute = () => { calls++; return success(); };
  assert.throws(() => executeMobilePacket(p, { db, execute }), /authorization_required/);
  const changed = structuredClone(p); changed.request.operation.command = "id";
  assert.throws(() => executeMobilePacket(changed, { db, authorization: auth(changed), execute }), /not_allowlisted/);
  assert.throws(() => executeMobilePacket(p, { db, authorization: auth(p), execute, route: "evil" }), /route_not_allowed/);
  assert.equal(calls, 0); db.close();
});

test("fixed timed SSH, durable claim, cold replay and edited request conflict", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mobile-test-"));
  const file = path.join(dir, "cop.sqlite"); let db = database(file); let calls = 0; const p = packet();
  const execute = (command, args, options) => {
    calls++; assert.equal(command, "ssh"); assert.equal(options.shell, false);
    assert.equal(options.timeout, 20000); assert.equal(options.killSignal, "SIGKILL");
    assert.ok(args.includes("StrictHostKeyChecking=yes"));
    assert.ok(args.at(-1).endsWith("'whoami && git --version'"));
    assert.ok(!args.join(" ").includes("touch"));
    assert.equal(db.prepare("SELECT count(*) n FROM cop_events WHERE kind = 'cop/execution.bound.v1'").get().n, 1);
    return success();
  };
  const result = executeMobilePacket(p, { db, authorization: auth(p), execute, simulation: true });
  assert.equal(result.execution_receipt.status, "completed");
  assert.equal(result.execution_binding.provider_ref, "provider:simulation");
  db.close(); db = database(file);
  const replay = executeMobilePacket(p, { db, authorization: auth(p), execute, simulation: true });
  assert.equal(replay.replayed, true); assert.equal(calls, 1);
  assert.equal(replay.execution_binding.provider_execution_id, result.execution_binding.provider_execution_id);
  const edited = prepareMobilePacket({ ...issue, body: "changed" }, { source });
  assert.throws(() => executeMobilePacket(edited, { db, authorization: auth(edited), simulation: true, execute }), /identity_conflict/);
  db.close(); fs.rmSync(dir, { recursive: true });
});

test("crashed claim is never automatically retried", () => {
  const db = database(); const p = packet();
  appendCopEvent(db, { id: "mobile:inseme-141-mobile-diagnostic-v1:claim", kind: "cop/execution.bound.v1",
    payload: { request_sha256: requestDigest(p.request), execution_binding: { provider_execution_id: "prior" } } });
  const result = executeMobilePacket(p, { db, authorization: auth(p), execute: () => assert.fail("must not run") });
  assert.equal(result.status, "needs_acceptance"); db.close();
});

test("timeout and provider exception become sanitized terminal receipts", () => {
  for (const execute of [() => ({ status: null, error: { code: "ETIMEDOUT", message: "SECRET" } }),
    () => { throw new Error("SECRET"); }]) {
    const db = database(); const p = packet();
    const result = executeMobilePacket(p, { db, authorization: auth(p), execute, simulation: true });
    assert.equal(result.ok, false); assert.equal(result.execution_receipt.terminal, true);
    assert.ok(!JSON.stringify(result).includes("SECRET")); db.close();
  }
  assert.equal(filterMobileOutput({ stdout: "u0_a393\ngit version 2.56.0\nSECRET", stderr: "SECRET" }).stdout, "");
});

test("direct route requires fracta", () => {
  assert.throws(() => mobileSshInvocation("fracta-local", "other"), /requires_fracta/);
  assert.equal(mobileSshInvocation("fracta-local", "fracta").timeout, 15000);
});

test("receipt publication timestamp and independent connection cannot rerun SSH", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mobile-concurrent-"));
  const file = path.join(dir, "cop.sqlite");
  const db = database(file); const other = database(file); const p = packet();
  const result = executeMobilePacket(p, { db, authorization: auth(p), simulation: true, execute: () => {
    const concurrent = executeMobilePacket(p, { db: other, authorization: auth(p), simulation: true,
      execute: () => assert.fail("second connection must not execute") });
    assert.equal(concurrent.status, "needs_acceptance");
    return success();
  } });
  assert.equal(result.ok, true);
  const timestampOnly = prepareMobilePacket({ ...issue, updated_at: "2026-10-10T12:00:00Z" }, { source });
  const replay = executeMobilePacket(timestampOnly, { db: other, authorization: auth(timestampOnly), simulation: true,
    execute: () => assert.fail("timestamp change must not rerun") });
  assert.equal(replay.replayed, true);
  db.close(); other.close(); fs.rmSync(dir, { recursive: true });
});

test("ONA scheduled diagnostic refuses missing independent authorization", async () => {
  const { runScheduledJob } = await import("../lib/node-agent/job-runner.js");
  await assert.rejects(runScheduledJob({ kind: MOBILE_OPERATION, config: { packet: packet() } }),
    /authorization_required/);
});
