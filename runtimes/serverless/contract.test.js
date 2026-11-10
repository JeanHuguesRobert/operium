import test from 'node:test';import assert from 'node:assert/strict';
import {FRACTA_FUNCTION_CONTRACT,defineFractaFunction,defineFunctionRoutes,routeMatches} from './contract.js';
test('portable Web Request / Response is independent of hosting vendor',async()=>{
 assert.equal(FRACTA_FUNCTION_CONTRACT,'operium.fracta-function.web.v1');
 const call=defineFractaFunction(async req=>Response.json({method:req.method}));
 const r=await call(new Request('https://any-provider.example/data'));assert.equal((await r.json()).method,'GET');
 await assert.rejects(()=>defineFractaFunction(async()=>({statusCode:200})) (new Request('https://example.org')),/web_response_required/);
});
test('manifest denies duplicates and patterns; runtime must explicitly bind routes',()=>{
 assert.throws(()=>defineFunctionRoutes([{path:'/x',handler:()=>new Response('x')},{path:'/x',handler:()=>new Response('x')}]),/invalid_route_manifest/);
 assert.throws(()=>defineFunctionRoutes([{path:'/bad*prefix',handler:()=>new Response('x')}]),/invalid_route_manifest/);
 assert.equal(routeMatches('/api/cop/*','/api/cop/x'),true);
 assert.equal(routeMatches('/api/cop/*','/api/copy/x'),false);
 assert.equal(routeMatches('/api/cop/*','/api/cop/'),false);
 assert.equal(defineFunctionRoutes([{path:'/x',handler:()=>new Response('x')}]).length,1);
});
