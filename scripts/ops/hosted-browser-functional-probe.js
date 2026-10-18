#!/usr/bin/env node
/**
 * Non-mutating Hosted Browser protocol probes.
 * A successful probe proves transport/protocol responsiveness only; never a usable
 * browser session or a successful recovery. No credentials or framebuffer bytes.
 */
import net from 'node:net';
import https from 'node:https';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function probeRfb({host='127.0.0.1', port=5911, timeoutMs=3000}={}) {
  return new Promise(resolve => {
    let done=false;
    const socket=net.connect({host,port});
    const finish=(status,reason) => {
      if(done) return;
      done=true; socket.destroy();
      resolve({surface:'rfb',status,reason,verified:'protocol-only'});
    };
    socket.setTimeout(timeoutMs);
    socket.once('error',e=>finish('failed',e.code||'connect_error'));
    socket.once('timeout',()=>finish('failed','timeout'));
    // TCP can split the 12-byte RFB banner across multiple frames.
    let banner=Buffer.alloc(0);
    socket.on('data',data=>{
      banner=Buffer.concat([banner,data]);
      if(banner.length<12)return;
      const valid=/^RFB 00[3-9]\.00[0-9]\n$/.test(banner.subarray(0,12).toString('ascii'));
      finish(valid?'responsive':'failed',valid?'rfb_banner':'invalid_banner');
    });
    socket.once('end',()=>finish('failed','closed_before_banner'));
  });
}

export function probeHttps({host='127.0.0.1',port=8444,timeoutMs=3000,allowSelfSigned=false}={}) {
  return new Promise(resolve=>{
    let done=false;
    const finish=(status,reason)=>{
      if(done)return;
      done=true;
      resolve({surface:'https',status,reason,verified:'listener-only'});
    };
    const req=https.request({hostname:host,port,path:'/',method:'HEAD',
      rejectUnauthorized:!allowSelfSigned,timeout:timeoutMs}, res=>{
        res.resume();
        const code=res.statusCode;
        finish([200,401,403].includes(code)?'responsive':'failed', 'http_'+code);
    });
    req.once('timeout',()=>req.destroy(Object.assign(new Error('timeout'),{code:'timeout'})));
    req.once('error',e=>finish('failed',e.code||'request_error'));
    req.end();
  });
}

function options(argv){
  const result={kind:'rfb',host:'127.0.0.1',port:null,timeoutMs:3000,allowSelfSigned:false};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--rfb'||a==='--https')result.kind=a.slice(2);
    else if(a==='--host')result.host=argv[++i];
    else if(a==='--port')result.port=Number(argv[++i]);
    else if(a==='--timeout-ms')result.timeoutMs=Number(argv[++i]);
    else if(a==='--allow-self-signed')result.allowSelfSigned=true;
    else throw new Error('unknown_argument');
  }
  if(!result.host||!Number.isInteger(result.timeoutMs)||result.timeoutMs<100||result.timeoutMs>10000||
    (result.port!==null&&(!Number.isInteger(result.port)||result.port<1||result.port>65535)))
    throw new Error('invalid_options');
  result.port??=(result.kind==='rfb'?5911:8444);
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url))){
  try {
    const o=options(process.argv.slice(2));
    const output=await(o.kind==='rfb'?probeRfb(o):probeHttps(o));
    process.stdout.write(JSON.stringify(output)+'\n');
    process.exitCode=output.status==='responsive'?0:1;
  }catch(e){process.stderr.write(JSON.stringify({status:'invalid',reason:e.message})+'\n');process.exitCode=2;}
}
