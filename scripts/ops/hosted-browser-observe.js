#!/usr/bin/env node
/**
 * Read-only hosted browser observation. No credentials, service mutation,
 * or claims of authenticated framebuffer usability.
 */
import {probeRfb,probeHttps} from './hosted-browser-functional-probe.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function observeHostedBrowser({
  rfbHost='127.0.0.1',rfbPort=5911,
  httpsHost='127.0.0.1',httpsPort=8444,
  timeoutMs=3000,allowSelfSigned=false,
  rfb=probeRfb,https=probeHttps,
}={}) {
  const [rfbResult,httpsResult]=await Promise.all([
    rfb({host:rfbHost,port:rfbPort,timeoutMs}),
    https({host:httpsHost,port:httpsPort,timeoutMs,allowSelfSigned}),
  ]);
  const responsive=rfbResult.status==='responsive'&&httpsResult.status==='responsive';
  return {
    schema:'operium.hosted-browser.observation.v1',
    observed_at:new Date().toISOString(),
    ok:responsive,
    state:responsive?'PROTOCOL_RESPONSIVE':'DEGRADED',
    verified:'protocol-and-listener-only',
    functional_session:'UNVERIFIED',
    recovery:'NOT_ATTEMPTED',
    observations:{rfb:rfbResult,https:httpsResult},
  };
}

function parseArgs(args){
  const opts={};
  const allowed={'--rfb-host':'rfbHost','--https-host':'httpsHost',
    '--rfb-port':'rfbPort','--https-port':'httpsPort','--timeout-ms':'timeoutMs'};
  for(let i=0;i<args.length;i++){
    if(args[i]==='--allow-self-signed'){opts.allowSelfSigned=true;continue;}
    const field=allowed[args[i]];
    if(!field||!args[i+1])throw new Error('invalid_argument');
    const val=args[++i];
    opts[field]=field.endsWith('Port')||field==='timeoutMs'?Number(val):val;
  }
  if(['rfbPort','httpsPort'].some(k=>opts[k]!==undefined&&
       (!Number.isInteger(opts[k])||opts[k]<1||opts[k]>65535)) ||
     (opts.timeoutMs!==undefined&&(!Number.isInteger(opts.timeoutMs)||
       opts.timeoutMs<100||opts.timeoutMs>10000)) ||
     ['rfbHost','httpsHost'].some(k=>opts[k]!==undefined&&
       (!/^[a-zA-Z0-9.:-]+$/.test(opts[k]))))throw new Error('invalid_argument');
  return opts;
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){
  try{
    const r=await observeHostedBrowser(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify(r));
    process.exitCode=r.ok?0:1;
  }catch(e){
    console.error(JSON.stringify({ok:false,error:e.message}));
    process.exitCode=2;
  }
}
