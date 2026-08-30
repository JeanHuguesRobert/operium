import { normalizeNsList } from "../calendar.js";

const DEFAULT_DOH = "https://cloudflare-dns.com/dns-query";

export async function checkDnsDelegation(spec = {}) {
  const domain = String(spec.domain || spec.config?.domain || "").trim().toLowerCase();
  if (!domain) {
    return { ok: false, error: "missing_domain" };
  }

  const expected = normalizeNsList(spec.expected_ns || spec.config?.expected_ns || []);
  if (!expected.length) {
    return { ok: false, error: "missing_expected_ns", domain };
  }

  let publicNs;
  try {
    publicNs = spec.resolver
      ? normalizeNsList(await spec.resolver(domain))
      : await resolveNsOverHttps(domain, spec);
  } catch (error) {
    return {
      ok: false,
      error: error.message || "dns_lookup_failed",
      domain,
      expected_ns: expected,
      public_ns: [],
      matched: false,
      checked_at: new Date().toISOString(),
    };
  }

  const matched = setsEqual(expected, publicNs);
  return {
    ok: true,
    kind: "dns.watch",
    domain,
    expected_ns: expected,
    public_ns: publicNs,
    matched,
    stop_condition_met: matched,
    checked_at: new Date().toISOString(),
  };
}

export async function resolveNsOverHttps(domain, options = {}) {
  const fetchImpl = options.fetch || fetch;
  const dohUrl = options.doh_url || options.config?.doh_url || DEFAULT_DOH;
  const url = `${dohUrl}?name=${encodeURIComponent(domain)}&type=NS`;
  const response = await fetchImpl(url, {
    headers: { Accept: "application/dns-json" },
  });
  if (!response?.ok) {
    throw new Error(`doh_http_${response?.status || "failed"}`);
  }
  const body = typeof response.json === "function" ? await response.json() : response.body;
  const answers = Array.isArray(body?.Answer) ? body.Answer : [];
  const names = answers
    .filter(answer => Number(answer.type) === 2 || String(answer.type).toUpperCase() === "NS")
    .map(answer => answer.data);
  return normalizeNsList(names);
}

function setsEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
