import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { prepareMobilePacket, requestDigest, MOBILE_ISSUE, MOBILE_OPERATION } from "../lib/node-agent/mobile-diagnostic.js";
import { appendCopEvent } from "../lib/node-agent/cop-events.js";
import { runResidentTick, validateResidentPolicy, publishResidentReceipt, receiptComment } from "./ona-mobile-diagnostic.js";

const source = { implementation_sha256: "a".repeat(64) };
const issue = { number: 141, html_url: MOBILE_ISSUE, user: { login: "JeanHuguesRobert" },
  state: "open", updated_at: "2026-10-10T09:27:16Z", body: "authorized packet" };
const policy = () => ({ schema: "operium.mobile-diagnostic-policy/v1", enabled: true,
  issue: MOBILE_ISSUE, operation: MOBILE_OPERATION, principal: "JeanHuguesRobert",
  execution: true, publish_receipt: true, authorization_ref: MOBILE_ISSUE + "#issuecomment-1", implementation_sha256: source.implementation_sha256,
  expires_at: "2099-01-01T00:00:00Z", request_sha256: requestDigest(prepareMobilePacket(issue, { source }).request) });
// A request hash covers the typed request, not the enclosing observation.
function admittedPolicy() {
  return { ...policy(), request_sha256: requestDigest(prepareMobilePacket(issue, { source }).request) };
}
function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(new URL("../lib/node-agent/migrations/005_cop_events.sql", import.meta.url), "utf8"));
  return db;
}
const result = { schema: "cop.compute-result/v1", ok: true, simulation: true,
  execution_binding: { provider_execution_id: "simulated-resident" },
  execution_receipt: { terminal: true, status: "completed" }, delivery: "pending" };

test("resident policy fails closed on expiry, source or authority mismatch", () => {
  const p = admittedPolicy();
  assert.equal(validateResidentPolicy(p, source), true);
  assert.equal(validateResidentPolicy({ ...p, enabled: false }, source), false);
  for (const change of [{ expires_at: "2000-01-01" }, { execution: false }, { publish_receipt: false },
    { implementation_sha256: "b".repeat(64) }, { principal: "other" }]) {
    assert.throws(() => validateResidentPolicy({ ...p, ...change }, source), /not_admitted/);
  }
});

test("resident consumes once and retries delivery without another execution or fetch", async () => {
  const db = database(); let executions = 0; let fetches = 0; let publications = 0;
  const options = { db, source, policy: admittedPolicy(), fetchImpl: async () => {
    fetches++; return { ok: true, json: async () => issue };
  }, executePacket: (packet, options) => {
    executions++; assert.equal(options.route, "fracta-local");
    assert.equal(options.authorization.request_sha256, requestDigest(packet.request));
    appendCopEvent(db, { id: "mobile:inseme-141-mobile-diagnostic-v1:result", kind: "cop/execution.receipt.v1", payload: result });
    return result;
  }, publish: () => { publications++; throw new Error("transport unavailable"); } };
  await assert.rejects(runResidentTick(options), /transport unavailable/);
  options.publish = () => { publications++; return { url: `${MOBILE_ISSUE}#issuecomment-1` }; };
  assert.equal((await runResidentTick(options)).ok, true);
  assert.equal((await runResidentTick(options)).replayed, true);
  assert.equal(executions, 1); assert.equal(fetches, 1); assert.equal(publications, 2); db.close();
});

test("edited issue cannot spend the pinned grant", async () => {
  const db = database();
  await assert.rejects(runResidentTick({ db, source, policy: admittedPolicy(),
    fetchImpl: async () => ({ ok: true, json: async () => ({ ...issue, body: "changed" }) }),
    executePacket: () => assert.fail("not authorized"), publish: () => assert.fail("no result"),
  }), /request_not_authorized/); db.close();
});

test("GitHub delivery recovers an exact existing comment and verifies read-back", () => {
  const comment = { id: 123, html_url: `${MOBILE_ISSUE}#issuecomment-123`,
    body: receiptComment(result), user: { login: "JeanHuguesRobert" } };
  let posts = 0;
  const run = (command, args, options) => {
    assert.equal(command, "gh"); assert.equal(options.shell, false);
    if (args.includes("POST")) posts++;
    const stdout = args[1] === "user" ? "JeanHuguesRobert\n" : args.includes("--slurp")
      ? JSON.stringify([[comment]]) : JSON.stringify(comment);
    return { status: 0, stdout };
  };
  const delivery = publishResidentReceipt(result, run);
  assert.equal(delivery.recovered, true); assert.equal(posts, 0);
  assert.throws(() => publishResidentReceipt(result, () => ({ status: 1, stderr: "SECRET" })), /delivery_unavailable/);
});

test("new GitHub callback is structured JSON and mismatched read-back fails", () => {
  const body = receiptComment(result); let posts = 0;
  const run = (_command, args, options) => {
    if (args[1] === "user") return { status: 0, stdout: "JeanHuguesRobert\n" };
    if (args.includes("--slurp")) return { status: 0, stdout: "[[]]" };
    if (args.includes("POST")) { posts++; assert.equal(JSON.parse(options.input).body, body); }
    return { status: 0, stdout: JSON.stringify({ id: 123, html_url: `${MOBILE_ISSUE}#issuecomment-123`,
      user: { login: "JeanHuguesRobert" }, body: args.includes("POST") ? body : "wrong" }) };
  };
  assert.throws(() => publishResidentReceipt(result, run), /readback_mismatch/);
  assert.equal(posts, 1);
});
