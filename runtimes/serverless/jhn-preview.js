#!/usr/bin/env node
/** Preview JHN SPA and local function manifest, no public listener, no DNS. */
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {JHN_ROUTES,PUBLIC_ORIGIN} from './jhn-functions-manifest.js';
import {routeMatches} from './contract.js';
import {JHN_PENDING_ROUTES} from './jhn-route-inventory.js';
const DIST='/srv/cogentia/repos/inseme/apps/platform/dist';
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
 '.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png',
 '.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const BLOCKED_PREFIXES=['/api/','/.netlify/','/artifact-access/'];
export function createJhnPreview({dist=DIST,port=8795,host='127.0.0.1',routes=JHN_ROUTES}={}){
 if(host!=='127.0.0.1'&&host!=='::1')throw Error('preview_loopback_only');
 const root=resolve(dist);
 const server=createServer(async(req,res)=>{
  function text(status,message){res.writeHead(status,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});res.end(message);}
  try{
   const url=new URL(req.url||'/',PUBLIC_ORIGIN),pathname=url.pathname;
   const registered=routes.find(r=>routeMatches(r.path,pathname));
   if(registered){
    let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>1048576)return text(413,'Too large');parts.push(part)}
    const headers=new Headers();for(const [k,v]of Object.entries(req.headers))if(typeof v==='string'&&!['host','connection','transfer-encoding','content-length'].includes(k))headers.set(k,v);
    const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(parts)}:{})});
    const response=await registered.invoke(request);
    const out={};for(const [k,v]of response.headers)if(!['content-length','connection','transfer-encoding'].includes(k))out[k]=v;
    res.writeHead(response.status,out);res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   if(JHN_PENDING_ROUTES.some(route=>routeMatches(route.path,pathname))){
     res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});
     res.end(JSON.stringify({ok:false,error:'jhn_route_not_migrated'}));return;
   }
   if(BLOCKED_PREFIXES.some(p=>pathname.startsWith(p)))return text(404,'API route not configured');
   if(!['GET','HEAD'].includes(req.method))return text(405,'Method not allowed');
   let file=decodeURIComponent(pathname);if(file.includes('\0')||file.includes('\\')||file.split('/').includes('..'))return text(400,'Invalid path');
   const looksLikeAsset=file.startsWith('/assets/')||file.includes('.');
   if(file==='/'||!looksLikeAsset)file='/index.html';
   const target=resolve(root,'.'+file);
   if(target!==root&&!target.startsWith(root+sep))return text(403,'Forbidden');
   const st=await stat(target).catch(()=>null);
   if(!st?.isFile())return text(404,'Not found');
   const bytes=await readFile(target);
   res.writeHead(200,{'content-type':TYPES[extname(file)]||'application/octet-stream','cache-control':file==='/index.html'?'no-store':'public, max-age=300','x-content-type-options':'nosniff'});
   res.end(req.method==='HEAD'?undefined:bytes);
  }catch{if(!res.headersSent)text(502,'Handler failed');else res.end();}
 });
 return {listen:()=>new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,host,()=>ok(server.address()))}),
 close:()=>new Promise(ok=>server.close(ok))};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const host=createJhnPreview({port:Number(process.env.JHN_PREVIEW_PORT||8795)});const a=await host.listen();
 console.log(JSON.stringify({service:'fractafunction.jhn.preview',host:a.address,port:a.port,public:false,routes:JHN_ROUTES.map(x=>({path:x.path,runtime:x.runtime}))}));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>host.close().finally(()=>process.exit(0)));
}
