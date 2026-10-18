// Bounded read-only probe. Only the protected operator catalogue supplies URLs.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export async function checkService({ url, timeout_ms }, fetchImpl = fetch) {
  const target = new URL(url);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.hash)
    throw new Error('invalid_service_endpoint');
  if (!Number.isInteger(timeout_ms) || timeout_ms < 100 || timeout_ms > 15000)
    throw new Error('invalid_probe_timeout');
  const observed_at = new Date().toISOString();
  let response;
  try {
    response = await fetchImpl(target.href, { method: 'GET', redirect: 'error',
      signal: AbortSignal.timeout(timeout_ms), headers: { Accept: 'application/json' } });
    const reader = response.body?.getReader();
    let size = 0; const chunks = [];
    if (reader) {
      try {
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          size += value.length;
          if (size > 16384) throw new Error('response_limit');
          chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel().catch(() => {}); }
    }
    let data; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { data = null; }
    const healthy = response.ok && data?.ok === true;
    const version = typeof data?.version === 'string' && /^[v0-9][0-9A-Za-z.+_-]{0,79}$/.test(data.version) ? data.version : null;
    const revision = typeof data?.commit === 'string' && /^[a-f0-9]{40}$/.test(data.commit) ? data.commit : null;
    return { observed_at, reachable: true, http_status: response.status,
      health: healthy ? 'reported_healthy' : data?.ok === false || !response.ok ? 'degraded' : 'unknown',
      reported_version: version, reported_revision: revision, deployed_revision_verified: false,
      functional_check: 'not_performed', error: data === null ? 'invalid_json' : null };
  } catch (error) {
    return { observed_at, reachable: Boolean(response), http_status: response?.status || null,
      health: 'unknown', reported_version: null, reported_revision: null,
      deployed_revision_verified: false, functional_check: 'not_performed',
      error: error.message === 'response_limit' ? 'response_limit' :
        error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timeout' : 'probe_unavailable' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) { size += chunk.length; if (size > 8192) throw Error('input_limit'); chunks.push(chunk); }
    console.log(JSON.stringify(await checkService(JSON.parse(Buffer.concat(chunks).toString('utf8')))));
  } catch { console.log(JSON.stringify({ error: 'invalid_probe_configuration' })); process.exitCode = 1; }
}
