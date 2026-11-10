import test from 'node:test';import assert from 'node:assert/strict';
import {createJhnPreview} from './jhn-preview.js';
import {createLocalConsentProxy} from './consent-local-adapter.js';
const UUID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('preview publishes current JHN SPA, isolates API routes and serves existing Node handler',async()=>{
 const site=createJhnPreview({port:0});const a=await site.listen();const base=`http://127.0.0.1:${a.port}`;
 try{
  const page=await fetch(base+'/cop/consent/'+UUID);assert.equal(page.status,200);assert.match(await page.text(),/index-[\w-]+\.js/);
  const api=await fetch(base+'/api/unconfigured');assert.equal(api.status,404);assert.doesNotMatch(await api.text(),/<html/i);
  const post=await fetch(base+'/cc/requete-conseil-constitutionnel-haute-corse-2026.pdf',{method:'POST'});
  assert.equal(post.status,405);assert.equal(post.headers.get('allow'),'GET');
  const consent=await fetch(base+'/api/cop/principal-consent/'+UUID);assert.equal(consent.status,401);
  assert.equal((await consent.json()).error,'supabase_session_required');
 }finally{await site.close()}
});
test('canonical COP relay preserves service 401/403 rather than converting them to 503',async()=>{
 let seen;const f=createLocalConsentProxy({fetchImpl:async(url,options)=>{
  seen={url,method:options.method,host:options.headers.host,origin:options.headers.origin};
  return Response.json({ok:false,error:'principal_session_not_verified',grants_mandate_authority:false},{status:403});
 }});
 const r=await f(new Request('https://jhn.baronsmariani.org/api/cop/principal-consent/'+UUID,{headers:{authorization:'Bearer aaaaaaaaaaaa'}}));
 assert.equal(r.status,403);assert.equal(seen.host,'jhn.baronsmariani.org');assert.equal(seen.origin,undefined);
 assert.equal((await r.json()).error,'principal_session_not_verified');
 const post=await f(new Request('https://jhn.baronsmariani.org/api/cop/principal-consent/'+UUID,{method:'POST',headers:{authorization:'Bearer aaaaaaaaaaaa',origin:'https://evil.example'},body:'{}'}));
 assert.equal(post.status,403);
});
test('canonical COP relay direct live preflight fails closed without Supabase bearer',async()=>{
 const f=createLocalConsentProxy();const response=await f(new Request('https://jhn.baronsmariani.org/api/cop/principal-consent/'+UUID));
 assert.equal(response.status,401);
});
test('all remaining legacy JHN API surfaces fail closed with named pending status',async()=>{
 const site=createJhnPreview({port:0});const a=await site.listen();const base=`http://127.0.0.1:${a.port}`;
 try{
  for(const path of ['/api/webhooks/github','/api/oleole/health','/artifact-access/a/testtoken']){
    const r=await fetch(base+path);assert.equal(r.status,503,path);
    assert.equal((await r.json()).error,'jhn_route_not_migrated',path);
  }
 }finally{await site.close()}
});
test('NASA and Interactions protected edge routes do not grant rights without bearer',async()=>{
 const site=createJhnPreview({port:0});const a=await site.listen();const base=`http://127.0.0.1:${a.port}`;
 try{
   // When Deno worker is not started, protected functions stay unavailable.
   for(const path of ['/api/nasa/control','/api/interactions/desk']){
     const r=await fetch(base+path);assert.equal(r.status,503,path);
   }
 }finally{await site.close()}
});
test('streaming facade forwards SSE chunks without rewriting provider headers',async()=>{
 const site=createJhnPreview({port:0,routes:[{path:'/api/stream-test',runtime:'test',invoke:()=>new Response(new ReadableStream({
  start(controller){controller.enqueue(new TextEncoder().encode('data: one\n\n'));controller.enqueue(new TextEncoder().encode('data: two\n\n'));controller.close();}
 }),{headers:{'content-type':'text/event-stream','cache-control':'no-cache'}})}]});
 const a=await site.listen();try{
  const r=await fetch(`http://127.0.0.1:${a.port}/api/stream-test`);
  assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'text/event-stream');
  assert.equal(await r.text(),'data: one\n\ndata: two\n\n');
 }finally{await site.close()}
});
