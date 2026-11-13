import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { applyNameserverCutover, planNameserverCutover } from "./ops/experimental/cloudflare-nameserver-cutover.js";

const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url, options });
  if (url.includes("client/v4/zones?")) return Response.json({ success: true, result: [{ id: "zone-1", status: "pending", name_servers: ["beta.ns.cloudflare.com", "alpha.ns.cloudflare.com"] }] });
  if (url.includes("zone-1/dns_records")) return Response.json({ success: true, result: Array.from({ length: 37 }, (_, index) => ({ type: "TXT", name: `record-${index}.example.com`, content: `value-${index}`, proxied: false })) });
  if (url.endsWith("/nameservers")) return Response.json({ nameservers: ["alpha.ns.cloudflare.com", "beta.ns.cloudflare.com"] });
  if (url.includes("/livedns/domains/")) return Response.json(Array.from({ length: 37 }, (_, index) => ({ rrset_type: "TXT", rrset_name: `record-${index}`, rrset_values: [`value-${index}`] })));
  if (url.includes("api.gandi.net")) return Response.json({ nameservers: ["ns-1.gandi.net", "ns-2.gandi.net"], status: ["clientTransferProhibited"] });
  throw new Error(`Unexpected URL ${url}`);
};

const plan = await planNameserverCutover({ domain: "example.com", cloudflareToken: "cf-token", gandiToken: "gandi-token", expectedRecordCount: 37, fetchImpl });
assert.equal(plan.ready_for_explicit_apply, true);
assert.deepEqual(plan.cloudflare.nameservers, ["alpha.ns.cloudflare.com", "beta.ns.cloudflare.com"]);
assert.equal(plan.checks.cloudflare_records_dns_only, true);
assert.equal(plan.checks.cloudflare_matches_gandi_livedns, true);
const applied = await applyNameserverCutover(plan, { domain: "example.com", gandiToken: "gandi-token", fetchImpl });
assert.equal(applied.applied, true);
assert.equal(calls.at(-1).options.method, "PUT");
assert.deepEqual(JSON.parse(calls.at(-1).options.body), { nameservers: ["alpha.ns.cloudflare.com", "beta.ns.cloudflare.com"] });

await assert.rejects(() => planNameserverCutover({ domain: "example.com", cloudflareToken: "cf-token", gandiToken: "gandi-token", expectedRecordCount: 0, fetchImpl }), /positive integer/);
const help = spawnSync(process.execPath, ["scripts/ops/experimental/cloudflare-nameserver-cutover.js", "--help"], { encoding: "utf8" });
assert.equal(help.status, 0);
assert.match(help.stdout, /Usage: cloudflare-nameserver-cutover/);
console.log(JSON.stringify({ ok: true, checks: 5 }));
