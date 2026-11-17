#!/usr/bin/env node
/** Launch only a fixed read-only Cloudflare Workers AI audit on Fracta2.
 * Load three Supabase bootstrap keys from the existing private .env;
 * the JHN Vault supplies Cloudflare credentials inside the child process.
 */
import {spawn} from 'node:child_process';
import {readJhnBootstrap} from '../bootstrap-jhn-deno.js';

const entry = '/srv/cogentia/repos/operium/runtimes/serverless/deploy/cloudflare-jhn-ai-audit.ts';
const deno = '/home/ubuntu/.local/lib/node_modules/deno/deno';
const action = process.argv[2] || 'audit';
if (!['audit','smoke'].includes(action)) throw Error('unsupported_cloudflare_action');
try {
  const b = readJhnBootstrap();
  const args = ['run','--no-check',
    '--config=/srv/cogentia/repos/operium/runtimes/serverless/deno.json',
    `--allow-net=${b.urlHost}:443,api.cloudflare.com:443,esm.sh:443,deno.land:443`,
    '--allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,SUPABASE_ANON_KEY',
    entry,action];
  const child = spawn(deno,args,{stdio:'inherit',env:{
    HOME:'/home/ubuntu',PATH:'/usr/local/bin:/usr/bin:/bin',...b.env,
  }});
  child.once('error',()=>{console.error('cloudflare_audit_launch_failed');process.exitCode=1});
  child.once('exit',(code,signal)=>{process.exitCode=code??(signal?1:0)});
} catch {console.error('cloudflare_audit_bootstrap_unavailable');process.exitCode=1}
