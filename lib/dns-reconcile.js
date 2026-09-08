import { promises as dns } from "node:dns";
import { readFile } from "node:fs/promises";

const RESOLVERS = ["1.1.1.1", "8.8.8.8"];

function unique(values) {
  return [...new Set(values.map(value => String(value).replace(/\.$/, "").toLowerCase()))].sort();
}

async function queryNameservers(domain, resolverAddress) {
  const resolver = new dns.Resolver();
  resolver.setServers([resolverAddress]);
  return unique(await resolver.resolveNs(domain));
}

async function checkHttps(host, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://${host}`, { method: "HEAD", redirect: "manual", signal: controller.signal });
    return { host, ok: response.status >= 200 && response.status < 500, status: response.status };
  } catch (error) {
    return { host, ok: false, error: error.name === "AbortError" ? "timeout" : error.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function reconcileDns({ manifestPath, timeoutMs = 10000 }) {
  if (!manifestPath) throw new Error("dns_reconcile_requires_manifest");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schema !== "operium.dns.reconciliation.v1" || !Array.isArray(manifest.domains)) {
    throw new Error("invalid_dns_reconciliation_manifest");
  }

  const domains = await Promise.all(manifest.domains.map(async entry => {
    const resolverResults = await Promise.all(RESOLVERS.map(async resolver => {
      try {
        return { resolver, nameservers: await queryNameservers(entry.domain, resolver) };
      } catch (error) {
        return { resolver, error: error.message };
      }
    }));
    const observed = unique(resolverResults.flatMap(result => result.nameservers || []));
    const expectedSuffix = entry.expected_nameserver_suffix.toLowerCase();
    const mismatched = observed.filter(name => !name.endsWith(expectedSuffix));
    const https = await Promise.all((entry.https_hosts || []).map(host => checkHttps(host, timeoutMs)));
    const uncertainty = resolverResults.filter(result => result.error).map(result => ({ resolver: result.resolver, error: result.error }));
    return {
      domain: entry.domain,
      expected: {
        authoritative_dns: entry.expected_authoritative_dns,
        nameserver_suffix: expectedSuffix,
        migration_state: entry.migration_state,
        dnssec_state: entry.dnssec_state || "not_declared",
        mail: entry.mail,
      },
      observed: { resolver_results: resolverResults, nameservers: observed, https },
      drift: {
        nameservers: mismatched.length ? { expected_suffix: expectedSuffix, unexpected: mismatched } : null,
        https: https.filter(result => !result.ok),
      },
      uncertainty,
      ok: mismatched.length === 0 && https.every(result => result.ok) && uncertainty.length === 0,
    };
  }));
  return {
    schema: "operium.dns.reconcile-result.v1",
    observed_at: new Date().toISOString(),
    mode: "read-only-public-dns-and-https",
    manifest: { path: manifestPath, observed_at: manifest.observed_at, source: manifest.source },
    domains,
    ok: domains.every(domain => domain.ok),
  };
}
