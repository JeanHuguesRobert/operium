#!/usr/bin/env node
/**
 * Credential-free Cloudflare DNS provisioner regression test.
 * The module doubles as a mock fetch preloader when MOCK_CLOUDFLARE_MODE is set.
 */
import assert from 'node:assert/strict'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const testFile = fileURLToPath(import.meta.url)
const target = join(dirname(testFile), 'provision-kys-services-dns.mjs')
const mode = process.env.MOCK_CLOUDFLARE_MODE

if (mode) {
  process.env.CLOUDFLARE_API_TOKEN = 'fixture-only-never-a-real-token'
  const expectZone = mode === 'services' || mode.startsWith('orta-') ? 'acorsica.org' : 'baronsmariani.org'
  const expectName = mode === 'services' ? 'services.acorsica.org' : mode.startsWith('orta-') ? 'orta.acorsica.org' : 'museum.baronsmariani.org'
  const expectTarget = 'fracta.fractavolta.com'
  globalThis.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET'
    const base = 'https://api.cloudflare.com/client/v4'
    assert.ok(String(url).startsWith(base), 'only expected Cloudflare API endpoint')
    assert.equal(opts.headers.Authorization, 'Bearer fixture-only-never-a-real-token')
    const u = new URL(String(url))
    const path = u.pathname.slice('/client/v4'.length)
    if (path === '/zones' && method === 'GET') {
      assert.equal(u.searchParams.get('name'), expectZone)
      assert.equal(u.searchParams.get('status'), 'active')
      return Response.json({ success: true, result: [{ name: expectZone, id: 'fixed-fixture-zone' }] })
    }
    if (path === '/zones/fixed-fixture-zone/dns_records' && method === 'GET') {
      assert.equal(u.searchParams.get('name'), expectName)
      const result = mode === 'existing' ? [{type:'CNAME',name:expectName,content:expectTarget+'.',proxied:false}]
        : mode === 'conflict' ? [{type:'CNAME',name:expectName,content:'wrong.example',proxied:false}]
        : []
      return Response.json({ success: true, result })
    }
    if (path === '/zones/fixed-fixture-zone/dns_records' && method === 'POST') {
      assert.ok(['apply','orta-apply'].includes(mode), 'DNS mutation must occur only in apply mode')
      const body = JSON.parse(opts.body)
      assert.deepEqual(body, {type:'CNAME',name:expectName,content:expectTarget,proxied:false,ttl:1})
      return Response.json({ success: true, result: { ...body, id: 'fixture-record-id' } })
    }
    throw new Error('unexpected provider request: ' + method + ' ' + path)
  }
} else {
  const run = (mode, args = []) => spawnSync(process.execPath,
    ['--import', new URL(import.meta.url).href, target, ...args],
    { encoding: 'utf8', timeout: 8000, env: { ...process.env,
      CLOUDFLARE_API_TOKEN:'fixture-only-never-a-real-token',
      CLOUDFLARE_API_KEY:'',
      MOCK_CLOUDFLARE_MODE:mode } })
  const dry = run('dryrun', ['--site=museum'])
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /DRY-RUN: would create DNS-only CNAME museum\.baronsmariani\.org -> fracta\.fractavolta\.com/)
  const apply = run('apply', ['--site=museum','--apply'])
  assert.equal(apply.status, 0, apply.stderr)
  assert.match(apply.stdout, /CREATED: museum\.baronsmariani\.org CNAME -> fracta\.fractavolta\.com/)
  const existing = run('existing', ['--site=museum','--apply'])
  assert.equal(existing.status, 0, existing.stderr)
  assert.match(existing.stdout, /UNCHANGED: existing DNS-only CNAME/)
  const conflict = run('conflict', ['--site=museum','--apply'])
  assert.equal(conflict.status, 1)
  assert.match(conflict.stderr, /CONFLICT: DNS name already has other record/)
  const backward = run('services')
  assert.equal(backward.status, 0, backward.stderr)
  assert.match(backward.stdout, /services\.acorsica\.org/)
  const invalid = run('dryrun', ['--site=wildcard'])
  assert.equal(invalid.status, 2)
  assert.match(invalid.stderr, /BLOCKED: unknown DNS site/)
  const orta = run('orta-dryrun', ['--site=orta'])
  assert.equal(orta.status, 0, orta.stderr)
  assert.match(orta.stdout, /DRY-RUN: would create DNS-only CNAME orta\.acorsica\.org/)
  const ortaApply = run('orta-apply', ['--site=orta','--apply'])
  assert.equal(ortaApply.status, 0, ortaApply.stderr)
  assert.match(ortaApply.stdout, /CREATED: orta\.acorsica\.org/)
  console.log('PASS: 8 Cloudflare DNS provisioner fixtures; no external API calls')
}
