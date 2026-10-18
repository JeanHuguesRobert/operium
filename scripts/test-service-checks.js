import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../lib/node-agent/migrate.js';
import { canonical, hash, consumePacket, defaultProviders, validatePacket } from '../lib/node-agent/packet-consumer.js';
import { runConsumerTick } from './ona-packet-consumer.js';
import { checkService } from './service-check-worker.js';
import { runConsumerProcess } from './ona-service-checks.js';

function fixture(t) {
  const db = new DatabaseSync(':memory:'); runMigrations(db, { seedLocalState: false }); t.after(() => db.close());
  const keys = crypto.generateKeyPairSync('ed25519');
  const source = { implementation_sha256: hash('service-test') };
  const policy = { schema: 'operium.packet-consumer-policy/v1', enabled: true, repositories: ['owner/repo'],
    revoked_grants: [], service_checks: { ona: { url: 'http://127.0.0.1:8794/health', hostname: 'fixture' } },
    issuers: { test: { principal: 'principal', public_key: keys.publicKey.export({ type: 'spki', format: 'pem' }) } } };
  let calls = 0, clock = Date.parse('2026-10-18T12:00:00Z');
  const providers = defaultProviders({ hostname: 'fixture', simulation: true, serviceChecks: policy.service_checks, execute: (command, args, options) => {
    calls++; assert.equal(command, process.execPath); assert.equal(options.shell, false);
    assert.equal(JSON.parse(options.input).url, policy.service_checks.ona.url);
    return { status: 0, stdout: JSON.stringify({ observed_at: new Date(clock).toISOString(), health: 'reported_healthy', functional_check: 'not_performed' }) };
  } });
  const grant = { schema: 'operium.service-check-grant/v1', id: 'standing-1', issuer: 'test', principal: 'principal',
    requests: [{ repository: 'owner/repo', issue: 1 }], services: ['ona'], catalogue_sha256: hash(policy.service_checks),
    implementation_sha256: source.implementation_sha256, provider_ref: 'provider:service:health', control_ref: 'operium:service-health:v1',
    effect_ceiling: 'read-only', execution: true, simulation: true, timeout_ms: 1000, max_executions: 2, min_interval_ms: 60000,
    not_before: new Date(clock - 1).toISOString(), expires_at: new Date(clock + 3600000).toISOString(), publish_receipt: true };
  const sign = value => ({ grant: value, signature: crypto.sign(null, Buffer.from(canonical(value)), keys.privateKey).toString('base64') });
  const signedGrant = sign(grant);
  const packet = id => ({ request: { schema: 'operium.packet-request/v1', id, repository: 'owner/repo', issue: 1,
    operation: { kind: 'service.health.check/v1', service: 'ona' }, timeout_ms: 1000, return: { github_issue: 1 } } });
  const publish = () => ({ verified: true, comment_id: 42, url: 'https://github.com/owner/repo/issues/1#issuecomment-42' });
  const consume = (p, options = {}) => consumePacket({ db, packet: p, signedGrant, source, policy, providers, now: () => clock, publish, ...options });
  return { db, source, policy, providers, grant, sign, signedGrant, packet, consume, publish,
    get calls() { return calls; }, now: () => clock, advance: ms => { clock += ms; } };
}

test('standing service grant enforces shared rate and total budget; replay spends nothing', t => {
  const f = fixture(t);
  assert.equal(f.consume(f.packet('one')).ok, true);
  assert.throws(() => f.consume(f.packet('two')), /grant_rate_limited/);
  assert.equal(f.consume(f.packet('one')).replayed, true);
  f.advance(60000); assert.equal(f.consume(f.packet('two')).ok, true);
  f.advance(60000); assert.throws(() => f.consume(f.packet('three')), /grant_budget_spent/);
  assert.equal(f.calls, 2);
});

test('standing service scope cannot authorize other operations, issues, catalogues or edited grant identities', t => {
  const f = fixture(t);
  for (const mutate of [p => { p.request.issue = p.request.return.github_issue = 2; },
    p => { p.request.operation = { kind: 'local.sha256/v1', text: 'not authorized' }; },
    p => { p.request.operation.service = 'other'; }]) {
    const p = f.packet('bad'); mutate(p); assert.throws(() => f.consume(p), /grant_not_admitted/);
  }
  const injected = f.packet('injected'); injected.request.operation.url = 'https://attacker.invalid';
  assert.throws(() => validatePacket(injected.request), /invalid_fields/);
  const wrongHost = defaultProviders({ hostname: 'other', simulation: true, serviceChecks: f.policy.service_checks });
  assert.throws(() => f.consume(f.packet('wrong-host'), { providers: wrongHost }), /service_runtime_mismatch/);
  f.consume(f.packet('one')); f.advance(60000);
  assert.throws(() => f.consume(f.packet('two'), { signedGrant: f.sign({ ...f.grant, max_executions: 3 }) }), /grant_identity_conflict/);
  f.policy.service_checks.ona.url = 'http://127.0.0.1:1/changed';
  assert.throws(() => f.consume(f.packet('three')), /service_catalogue_changed/);
  assert.equal(f.calls, 1);
});

test('expiry and durable revocation apply to recurring grants including replay', t => {
  const f = fixture(t); f.consume(f.packet('one'));
  f.policy.revoked_grants.push(f.grant.id);
  assert.throws(() => f.consume(f.packet('one')), /grant_revoked/);
  f.policy.revoked_grants = [];
  assert.throws(() => f.consume(f.packet('one')), /grant_revoked/);
  f.advance(3600001);
  assert.throws(() => f.consume(f.packet('two')), /grant_not_admitted/);
  assert.equal(f.calls, 1);
});

test('follow_issue repairs an earlier receipt before admitting changed request and never repeats provider', async t => {
  const f = fixture(t); let current = f.packet('one'), deliveryFails = true;
  f.policy.requests = [{ repository: 'owner/repo', issue: 1, follow_issue: true, signed_grant: f.signedGrant }];
  const tick = () => runConsumerTick({ db: f.db, policy: f.policy, source: f.source, providers: f.providers, now: f.now,
    fetchImpl: async () => ({ ok: true, json: async () => ({ state: 'open', number: 1, html_url: 'https://github.com/owner/repo/issues/1',
      body: '```json\n' + JSON.stringify(current.request) + '\n```' }) }),
    publish: () => { if (deliveryFails) throw Error('callback_unavailable'); return f.publish(); } });
  assert.equal((await tick()).ok, false); assert.equal(f.calls, 1);
  current = f.packet('two'); deliveryFails = false; f.advance(60000);
  const repair = await tick(); assert.equal(repair.results[0].id, 'one'); assert.equal(repair.control.api_read_attempts, 0);
  assert.equal(f.calls, 1);
  assert.equal((await tick()).results[0].id, 'two'); assert.equal(f.calls, 2);
  assert.equal((await tick()).ok, true); assert.equal(f.calls, 2);
});

test('service result distinguishes reported health from functional and deployment proof without raw body disclosure', async () => {
  const result = await checkService({ url: 'https://example.invalid/health', timeout_ms: 500 }, async (url, options) => {
    assert.equal(options.redirect, 'error'); assert.equal(options.method, 'GET');
    return new Response(JSON.stringify({ ok: true, version: '1.2.3', commit: 'a'.repeat(40), secret: 'never publish' }));
  });
  assert.equal(result.health, 'reported_healthy'); assert.equal(result.reported_version, '1.2.3');
  assert.equal(result.deployed_revision_verified, false); assert.equal(result.functional_check, 'not_performed');
  assert.ok(!JSON.stringify(result).includes('never publish'));
  const degraded = await checkService({ url: 'https://example.invalid/health', timeout_ms: 500 }, async () => new Response('{"ok":false}'));
  assert.equal(degraded.health, 'degraded');
});

test('service response bounds and failures remain explicit, sanitized observations', async () => {
  const input = { url: 'https://example.invalid/health', timeout_ms: 500 };
  assert.equal((await checkService(input, async () => new Response('x'.repeat(20000)))).error, 'response_limit');
  assert.equal((await checkService(input, async () => new Response('<html>'))).health, 'unknown');
  const failed = await checkService(input, async () => { throw Error('secret internal endpoint'); });
  assert.equal(failed.error, 'probe_unavailable'); assert.equal(failed.reachable, false);
  await assert.rejects(checkService({ ...input, url: 'https://user:secret@example.invalid' }), /invalid_service_endpoint/);
});

test('real loopback HTTP probe refuses redirects and bounds body and deadline', async t => {
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/health' }); res.end(); }
    else if (req.url === '/large') { res.end('x'.repeat(20000)); }
    else if (req.url === '/slow') { /* Deliberately no response; client deadline must end the request. */ }
    else { res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true,"version":"1.2.3"}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const probe = route => checkService({ url: base + route, timeout_ms: 1000 });
  assert.equal((await probe('/health')).health, 'reported_healthy');
  assert.equal((await probe('/redirect')).error, 'probe_unavailable');
  assert.equal((await probe('/large')).error, 'response_limit');
  assert.equal((await probe('/slow')).error, 'timeout');
});

test('isolated consumer leaves parent ONA event loop able to answer its own health probe', async t => {
  const server = http.createServer((req, res) => { res.end('{"ok":true}'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const target = `http://127.0.0.1:${server.address().port}/health`;
  const code = `const r = await fetch(${JSON.stringify(target)}, {signal:AbortSignal.timeout(3000)}); console.log(JSON.stringify(await r.json()));`;
  const result = await runConsumerProcess({ timeoutMs: 10000, spawnImpl: (command, args, options) => {
    assert.equal(options.shell, false); assert.equal(args.at(-1), 'tick');
    return spawn(command, ['--input-type=module', '-e', code], options);
  } });
  assert.deepEqual(result, { ok: true });
});
