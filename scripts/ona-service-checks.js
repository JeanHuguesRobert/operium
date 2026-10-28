// Existing ONA script-job hook, isolated so probes can reach the parent ONA HTTP server.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { consumerSource } from './ona-packet-consumer.js';
const loadedDigest = consumerSource().implementation_sha256;

export function runConsumerProcess({ env = process.env, spawnImpl = spawn, timeoutMs = 480000 } = {}) {
  return new Promise(resolve => {
    let child, output = '', settled = false, timer;
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
    const stop = error => { child?.kill('SIGKILL'); finish({ ok: false, error }); };
    try {
      child = spawnImpl(process.execPath, [fileURLToPath(new URL('./ona-packet-consumer.js', import.meta.url)), 'tick'],
        { env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      timer = setTimeout(() => stop('packet_consumer_process_timeout'), timeoutMs);
      child.stdout.on('data', chunk => {
        output += chunk.toString('utf8');
        if (Buffer.byteLength(output) > 65536) stop('packet_consumer_process_output_limit');
      });
      child.on('error', () => stop('packet_consumer_process_unavailable'));
      child.on('close', code => {
        try {
          const result = JSON.parse(output);
          if (![0, 1].includes(code) || typeof result.ok !== 'boolean') throw Error();
          finish(result);
        } catch { finish({ ok: false, error: 'packet_consumer_process_failed' }); }
      });
    } catch { stop('packet_consumer_process_unavailable'); }
  });
}

export async function runScheduledHeartbeat({ env = process.env } = {}) {
  if (!env.ONA_PACKET_CONSUMER_POLICY) return { ok: true, skipped: 'policy_not_configured' };
  try {
    if (JSON.parse(fs.readFileSync(env.ONA_PACKET_CONSUMER_POLICY, 'utf8')).enabled !== true)
      return { ok: true, skipped: 'policy_disabled' };
    if (consumerSource().implementation_sha256 !== loadedDigest)
      return { ok: false, error: 'loaded_source_changed' };
    return await runConsumerProcess({ env });
  } catch { return { ok: false, error: 'packet_consumer_unavailable' }; }
}
