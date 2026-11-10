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
