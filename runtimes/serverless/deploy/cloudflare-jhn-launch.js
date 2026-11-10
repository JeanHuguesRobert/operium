#!/usr/bin/env node
/** Bounded DNS control: load existing Supabase bootstrap, use existing Vault.
 * Must be called as ubuntu; root orchestrator drops privileges to ubuntu.
 */
import {spawn} from 'node:child_process';
import {readJhnBootstrap} from '../bootstrap-jhn-deno.js';
const action=process.argv[2]||'audit';
if(!['audit','apply','rollback'].includes(action))throw Error('dns_action_not_allowed');
const b=readJhnBootstrap();
const args=['run','--no-check','--config=/srv/cogentia/repos/operium/runtimes/serverless/deno.json',
  `--allow-net=${b.urlHost}:443,api.cloudflare.com:443,esm.sh:443,deno.land:443`,
  '--allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,SUPABASE_ANON_KEY',
  '/srv/cogentia/repos/operium/runtimes/serverless/deploy/cloudflare-jhn-cutover.ts',action];
const child=spawn('/home/ubuntu/.local/lib/node_modules/deno/deno',args,{stdio:'inherit',env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/home/ubuntu',...b.env}});
child.once('error',e=>{console.error('dns_client_launch_failed',e.code);process.exitCode=1});
child.once('exit',(code,signal)=>{process.exitCode=code??(signal?1:0)});
