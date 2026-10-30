#!/usr/bin/env node
/**
 * Idempotent Cloudflare DNS-only CNAME provisioning for a single named public
 * service. No secret is printed. Default is read-only; --apply is explicit.
 * Run on the authorized operator workstation with CLOUDFLARE_API_TOKEN set,
 * or CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL for legacy global-key auth.
 */
import process from 'node:process'

const ZONE = 'acorsica.org'
const NAME = 'services.acorsica.org'
const TARGET = 'fracta.fractavolta.com'
const API = 'https://api.cloudflare.com/client/v4'
const apply = process.argv.includes('--apply')
const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN
const legacyKey = process.env.CLOUDFLARE_API_KEY
const legacyEmail = process.env.CLOUDFLARE_EMAIL

// The Agent JHN "Vault" is public.instance_config, NOT Supabase vault.secrets.
// Retrieval and the Cloudflare mutation happen in the same operator process;
// no decrypted secret is printed, written to disk, or passed to the assistant.
async function fromJhnVault() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { available: false }
  if (new URL(url).hostname !== 'ndiysuhzmztatpxbkezn.supabase.co') {
    throw Error('Refusing vault access: SUPABASE_URL does not identify JHN project')
  }
  const response = await fetch(`${url}/rest/v1/instance_config?select=key,value&key=in.(cloudflare_api_token,cloudflare_api_key,cloudflare_email)`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw Error(`JHN instance_config metadata lookup failed: HTTP ${response.status}`)
  const rows = await response.json()
  const values = Object.fromEntries(rows.map(row => [row.key, row.value]))
  const bearer = values.cloudflare_api_token
  if (bearer) return { available: true, headers: { Authorization: `Bearer ${bearer}` } }
  if (values.cloudflare_api_key && values.cloudflare_email) {
    return { available: true, headers: { 'X-Auth-Key': values.cloudflare_api_key, 'X-Auth-Email': values.cloudflare_email } }
  }
  return { available: true, headers: null }
}

let headers = token
  ? { Authorization: `Bearer ${token}` }
  : legacyKey && legacyEmail
    ? { 'X-Auth-Key': legacyKey, 'X-Auth-Email': legacyEmail }
    : null

if (!headers) {
  try {
    const vault = await fromJhnVault()
    headers = vault.headers
    if (!headers) {
      console.error(vault.available
        ? 'BLOCKED: JHN instance_config has no complete Cloudflare credential; sync it from the workstation SoT.'
        : 'BLOCKED: no Cloudflare credential in environment, and JHN vault cannot be accessed without service-role configuration.')
      process.exit(2)
    }
  } catch (error) {
    console.error('BLOCKED:', error.message)
    process.exit(2)
  }
}

async function cf(path, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: { ...headers, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(12000),
  })
  let body
  try { body = await response.json() } catch { throw Error(`Cloudflare HTTP ${response.status}, invalid JSON`) }
  if (!response.ok || !body.success) {
    const codes = (body.errors || []).map(e => e.code).join(',')
    throw Error(`Cloudflare HTTP ${response.status}, error codes ${codes || 'unspecified'}`)
  }
  return body
}

try {
  const zones = (await cf(`/zones?name=${encodeURIComponent(ZONE)}&status=active&per_page=50`)).result
  if (zones.length !== 1 || zones[0].name !== ZONE) throw Error('Cannot uniquely resolve active Cloudflare zone')
  const zone = zones[0].id
  const records = (await cf(`/zones/${zone}/dns_records?name=${encodeURIComponent(NAME)}&per_page=100`)).result
  if (records.length) {
    if (records.length === 1 && records[0].type === 'CNAME' &&
        records[0].content.replace(/\\.$/, '').toLowerCase() === TARGET &&
        records[0].proxied === false) {
      console.log('UNCHANGED: existing DNS-only CNAME already matches desired record')
      process.exit(0)
    }
    throw Error('CONFLICT: DNS name already has other record(s); manual review required, no changes made')
  }
  if (!apply) {
    console.log(`DRY-RUN: would create DNS-only CNAME ${NAME} -> ${TARGET}`)
    process.exit(0)
  }
  const payload = { type: 'CNAME', name: NAME, content: TARGET, proxied: false, ttl: 1 }
  const created = (await cf(`/zones/${zone}/dns_records`, {
    method: 'POST', body: JSON.stringify(payload),
  })).result
  if (created.name !== NAME || created.type !== 'CNAME' || created.proxied !== false) {
    throw Error('Provider response does not match desired record; inspect zone')
  }
  console.log(`CREATED: ${created.name} CNAME -> ${created.content} (DNS-only), record id ${created.id}`)
} catch (error) {
  console.error('BLOCKED:', error.message)
  process.exitCode = 1
}
