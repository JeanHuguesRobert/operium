import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalConsentProxy} from './consent-local-adapter.js';
const origin='https://jhn.baronsmariani.org',path='/api/cop/principal-consent/continuation-request';
test('continuation consent request relays only with Principal bearer and correct origin',async()=>{
 let calls=0;
 const handler=createLocalConsentProxy({fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'http://127.0.0.1:8796'+path);
  assert.equal(options.headers.host,'jhn.baronsmariani.org');
  assert.equal(options.headers.origin,origin);
  assert.equal(options.method,'POST');
  assert.equal(options.body,'{}');
  return Response.json({ok:true,challenge_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},{status:201});
 }});
 const req=(token,o=origin,body='{}')=>new Request(origin+path,{method:'POST',headers:{origin:o,authorization:token?'Bearer '+token:undefined,'content-type':'application/json'},body});
 assert.equal((await handler(req(null))).status,401);
 assert.equal((await handler(req('principal-long-token','https://evil.example'))).status,403);
 assert.equal(calls,0);
 const r=await handler(req('principal-long-token'));assert.equal(r.status,201);
 assert.equal((await r.json()).ok,true);assert.equal(calls,1);
});
test('continuation request rejects GET and query suffix',async()=>{
 const handler=createLocalConsentProxy({fetchImpl:()=>{throw Error('should not call')}});
 assert.equal((await handler(new Request(origin+path))).status,405);
 assert.equal((await handler(new Request(origin+path+'?x=1',{method:'POST',headers:{origin,authorization:'Bearer long-token-123'},body:'{}'}))).status,404);
});
