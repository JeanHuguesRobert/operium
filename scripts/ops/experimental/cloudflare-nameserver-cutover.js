#!/usr/bin/env node
// EXPERIMENTAL, not deployed. Historical Aug-2026 WIP from ThinkPad stash 2d7db8fb.
// Owner: Operium #37. Live DNS/mail mutations require a fresh explicit mandate.
// The --apply switch is retained only for code archaeology and mocked tests.
import { pathToFileURL } from "node:url";
/**
 * Plan or explicitly apply a Gandi -> Cloudflare nameserver cutover.
 *
 * This script never handles registrar billing, transfer authorization codes,
 * or Cloudflare Email Routing. It changes Gandi nameservers only when both
 * --apply-nameservers and --confirm-domain=<domain> are supplied.
 *
 * Required environment variables:
 *   CLOUDFLARE_API_KEY  Cloudflare API token with Zone:Read
 *   GANDI_ACCESS_KEY    Gandi personal access token with domain permissions
 *
 * Examples:
 *   node scripts/ops/experimental/cloudflare-nameserver-cutover.js --domain=example.com --json
 *   node scripts/ops/experimental/cloudflare-nameserver-cutover.js --domain=example.com \
 *     --expected-record-count=37 --apply-nameservers --confirm-domain=example.com
 */

function parseArgs(argv) {
  const options = { json: false, apply: false, domain: null, confirmDomain: null, expectedRecordCount: null };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--apply-nameservers") options.apply = true;
    else if (arg.startsWith("--domain=")) options.domain = arg.slice("--domain=".length).toLowerCase();
    else if (arg.startsWith("--confirm-domain=")) options.confirmDomain = arg.slice("--confirm-domain=".length).toLowerCase();
    else if (arg.startsWith("--expected-record-count=")) options.expectedRecordCount = Number(arg.slice("--expected-record-count=".length));
    else if (arg === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function normalizeNameservers(nameservers = []) {
  return [...nameservers].map((value) => value.toLowerCase().replace(/\.$/, "")).sort();
}

function normalizeName(name, domain) {
  const value = String(name ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!value || value === "@") return domain;
  return value === domain || value.endsWith(`.${domain}`) ? value : `${value}.${domain}`;
}

function normalizeTarget(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "." ? normalized : normalized.replace(/\.$/, "");
}

function canonicalCloudflareRecord(record, domain) {
  const type = String(record.type).toUpperCase();
  const name = normalizeName(record.name, domain);
  if (type === "NS" && name === domain) return null;
  if (type === "MX") return `${type}|${name}|${record.priority} ${normalizeTarget(record.content)}`;
  if (type === "SRV") {
    const data = record.data ?? {};
    const parts = String(record.content ?? "").trim().split(/\s+/);
    const priority = data.priority ?? record.priority ?? parts[0];
    const weight = data.weight ?? parts.at(-3);
    const port = data.port ?? parts.at(-2);
    const target = data.target ?? parts.at(-1);
    return `${type}|${name}|${priority} ${weight} ${port} ${normalizeTarget(target)}`;
  }
  return `${type}|${name}|${normalizeTarget(record.content)}`;
}

function canonicalGandiRecord(record, domain) {
  const type = String(record.rrset_type).toUpperCase();
  const name = normalizeName(record.rrset_name, domain);
  if (type === "NS" && name === domain) return [];
  return (record.rrset_values ?? []).map((value) => `${type}|${name}|${normalizeTarget(value)}`);
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

async function apiJson(fetchImpl, url, options, label) {
  const response = await fetchImpl(url, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${label} failed: HTTP ${response.status}`);
  return body;
}

export async function planNameserverCutover({ domain, cloudflareToken, gandiToken, expectedRecordCount = null, fetchImpl = fetch }) {
  if (!domain) throw new Error("--domain is required");
  if (!cloudflareToken) throw new Error("CLOUDFLARE_API_KEY is required");
  if (!gandiToken) throw new Error("GANDI_ACCESS_KEY is required");
  if (expectedRecordCount !== null && (!Number.isInteger(expectedRecordCount) || expectedRecordCount < 1)) {
    throw new Error("--expected-record-count must be a positive integer");
  }

  const cfHeaders = { Authorization: `Bearer ${cloudflareToken}` };
  const zoneResponse = await apiJson(fetchImpl, `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(domain)}`, { headers: cfHeaders }, "Cloudflare zone lookup");
  if (!zoneResponse?.success || !Array.isArray(zoneResponse.result) || zoneResponse.result.length !== 1) {
    throw new Error(`Cloudflare zone lookup did not return exactly one zone for ${domain}`);
  }
  const zone = zoneResponse.result[0];
  const recordsResponse = await apiJson(fetchImpl, `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zone.id)}/dns_records?per_page=100`, { headers: cfHeaders }, "Cloudflare record lookup");
  if (!recordsResponse?.success || !Array.isArray(recordsResponse.result)) throw new Error("Cloudflare record lookup returned an invalid response");

  const gandiHeaders = { Authorization: `Bearer ${gandiToken}` };
  const gandi = await apiJson(fetchImpl, `https://api.gandi.net/v5/domain/domains/${encodeURIComponent(domain)}`, { headers: gandiHeaders }, "Gandi domain lookup");
  const gandiRecords = await apiJson(fetchImpl, `https://api.gandi.net/v5/livedns/domains/${encodeURIComponent(domain)}/records`, { headers: gandiHeaders }, "Gandi LiveDNS record lookup");
  if (!Array.isArray(gandiRecords)) throw new Error("Gandi LiveDNS record lookup returned an invalid response");
  const targetNameservers = normalizeNameservers(zone.name_servers);
  const currentNameservers = normalizeNameservers(gandi.nameservers);
  const proxiedCount = recordsResponse.result.filter((record) => record.proxied === true).length;
  const recordCount = recordsResponse.result.length;
  const alreadyApplied = JSON.stringify(targetNameservers) === JSON.stringify(currentNameservers);
  const cloudflareCanonicalRecords = recordsResponse.result
    .map((record) => canonicalCloudflareRecord(record, domain))
    .filter(Boolean)
    .sort();
  const gandiCanonicalRecords = gandiRecords
    .flatMap((record) => canonicalGandiRecord(record, domain))
    .sort();
  const cloudflareOnlyRecords = difference(cloudflareCanonicalRecords, gandiCanonicalRecords);
  const gandiOnlyRecords = difference(gandiCanonicalRecords, cloudflareCanonicalRecords);
  const dnsSemanticallyMatches = cloudflareOnlyRecords.length === 0 && gandiOnlyRecords.length === 0;
  const checks = {
    target_nameservers_present: targetNameservers.length >= 2,
    cloudflare_record_count_matches: expectedRecordCount === null ? null : recordCount === expectedRecordCount,
    cloudflare_records_dns_only: proxiedCount === 0,
    cloudflare_matches_gandi_livedns: dnsSemanticallyMatches,
    gandi_nameservers_need_change: !alreadyApplied,
  };
  return {
    schema: "operium.cloudflare-nameserver-cutover-plan.v1",
    domain,
    cloudflare: { zone_id: zone.id, status: zone.status, nameservers: targetNameservers, record_count: recordCount, proxied_count: proxiedCount },
    gandi: { nameservers: currentNameservers, status: gandi.status ?? [], livedns_record_count: gandiRecords.length },
    dns_comparison: {
      semantics: "record type, owner name, and DNS payload; apex NS records are excluded because delegation is assessed separately",
      cloudflare_only: cloudflareOnlyRecords,
      gandi_only: gandiOnlyRecords,
    },
    checks,
    ready_for_explicit_apply: checks.target_nameservers_present && checks.cloudflare_records_dns_only && checks.cloudflare_matches_gandi_livedns && checks.gandi_nameservers_need_change && (checks.cloudflare_record_count_matches !== false),
    scope_boundary: "Nameserver delegation only. Email Routing and registrar transfer are separate, human-governed stages.",
  };
}

export async function applyNameserverCutover(plan, { domain, gandiToken, fetchImpl = fetch }) {
  if (!plan.ready_for_explicit_apply) throw new Error("Refusing apply: plan preconditions are not satisfied");
  const response = await apiJson(fetchImpl, `https://api.gandi.net/v5/domain/domains/${encodeURIComponent(domain)}/nameservers`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${gandiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ nameservers: plan.cloudflare.nameservers }),
  }, "Gandi nameserver update");
  return { ...plan, applied: true, gandi_response: response };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: cloudflare-nameserver-cutover.js --domain=<domain> [--expected-record-count=<n>] [--json] [--apply-nameservers --confirm-domain=<domain>]");
    return;
  }
  const plan = await planNameserverCutover({
    domain: options.domain,
    cloudflareToken: process.env.CLOUDFLARE_API_KEY,
    gandiToken: process.env.GANDI_ACCESS_KEY,
    expectedRecordCount: options.expectedRecordCount,
  });
  let result = plan;
  if (options.apply) {
    if (options.confirmDomain !== options.domain) throw new Error("Refusing apply: --confirm-domain must exactly match --domain");
    if (options.expectedRecordCount === null) throw new Error("Refusing apply: --expected-record-count is required");
    result = await applyNameserverCutover(plan, { domain: options.domain, gandiToken: process.env.GANDI_ACCESS_KEY });
  }
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`${result.applied ? "APPLIED" : "PLAN"}: ${result.domain} -> ${result.cloudflare.nameservers.join(", ")} (ready=${result.ready_for_explicit_apply})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`ERROR: ${error.message}`); process.exitCode = 1; });
}
