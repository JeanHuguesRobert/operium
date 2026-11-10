import test from 'node:test';import assert from 'node:assert/strict';
import {invokeNodeFunction} from './node-adapter.js';
import {createServerlessHost} from './host.js';
test('Node Netlify event has query, method, body and returns base64 bytes',async()=>{
 let captured;
 const r=await invokeNodeFunction(async event=>{captured=event;return {statusCode:201,body:Buffer.from('PDF').toString('base64'),isBase64Encoded:true,headers:{'content-type':'application/pdf'}}},new Request('https://jhn.baronsmariani.org/.netlify/functions/pdf?foo=hello&foo=world',{method:'POST',body:'test-body'}));
 assert.equal(r.status,201);assert.equal((await r.text()),'PDF');assert.equal(captured.httpMethod,'POST');assert.equal(captured.body,'test-body');assert.deepEqual(captured.multiValueQueryStringParameters.foo,['hello','world']);
});
test('Node host routes only explicit paths and remains on loopback',async()=>{
 assert.throws(()=>createServerlessHost({host:'0.0.0.0',routes:[]}),/loopback/);
 const s=createServerlessHost({routes:[{match:p=>p==='/demo',invoke:r=>invokeNodeFunction(()=>({statusCode:200,body:'ok',headers:{'x-test':'yes'}}),r)}]});
 const address=await s.listen();try{
 const ok=await fetch(`http://127.0.0.1:${address.port}/demo`);assert.equal(ok.status,200);assert.equal(await ok.text(),'ok');
 assert.equal((await fetch(`http://127.0.0.1:${address.port}/absent`)).status,404);
 }finally{await s.close()}
});
