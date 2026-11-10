#!/usr/bin/env node
/** Read three existing Supabase bootstrap variables at worker startup.
 * Secrets stay in inseme/.env (0600); no second secrets file or Netlify proxy.
 * Deno receives only the three bootstrap keys plus its worker port; no shell.
 */
import {readFileSync,statSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import dotenv from '../../../inseme/node_modules/dotenv/lib/main.js';
const source='/srv/cogentia/repos/inseme/.env';
const runtime='/home/ubuntu/.local/lib/node_modules/deno/deno';
const directory=resolve(import.meta.dirname);
const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY'];
export function readJhnBootstrap(file=source){
 const meta=statSync(file);
 if((meta.mode&0o077)!==0)throw Error('bootstrap_file_permissions_too_open');
 const parsed=dotenv.parse(readFileSync(file));
 for(const k of keys)if(!parsed[k]||typeof parsed[k]!=='string')throw Error('bootstrap_key_missing:'+k);
 const url=new URL(parsed.SUPABASE_URL);
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash)
    throw Error('bootstrap_url_invalid');
 if(!/^[a-z0-9.-]+$/i.test(url.hostname))throw Error('bootstrap_hostname_invalid');
 return {urlHost:url.hostname,env:Object.fromEntries(keys.map(k=>[k,parsed[k]]))};
}
export function buildJhnDenoCommand({bootstrap,probe=false,deno=runtime}={}){
 if(!bootstrap?.urlHost||!bootstrap?.env)throw Error('bootstrap_required');
 const args=['run','--no-check',`--config=${directory}/deno.json`,
   `--allow-net=127.0.0.1:8797,api.open-meteo.com:443,esm.sh:443,deno.land:443,${bootstrap.urlHost}:443`,
   '--allow-env=SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,SUPABASE_ANON_KEY,FRACTAFUNCTION_DENO_PORT'];
 if(probe)args.push(`${directory}/probe-jhn-vault.ts`);
 else args.push(`${directory}/jhn-deno-runtime.ts`);
 const env={PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/home/ubuntu',
  FRACTAFUNCTION_DENO_PORT:'8797',...bootstrap.env};
 // systemd grants one writable runtime cache; no secret source is copied.
 if(process.env.DENO_DIR?.startsWith('/run/fractafunction-jhn-deno'))env.DENO_DIR=process.env.DENO_DIR;
 return {deno,args,env};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 try{
  const command=buildJhnDenoCommand({bootstrap:readJhnBootstrap(),probe:process.argv.includes('--probe')});
  const worker=spawn(command.deno,command.args,{stdio:'inherit',env:command.env});
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>worker.kill(signal));
  worker.on('error',e=>{console.error('Deno worker could not launch',e.code);process.exitCode=1});
  worker.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0)});
 }catch(error){console.error('JHN bootstrap refused:',error.message);process.exitCode=1}
}
