import test from 'node:test';import assert from 'node:assert/strict';
import {createDenoLoopback} from './deno-local-adapter.js';
test('missing Deno worker fails closed; cross-origin denied',async()=>{
 const f=createDenoLoopback({port:45999});
 assert.equal((await f(new Request('https://wrong.example/api/corsica/context'))).status,403);
 const r=await f(new Request('https://jhn.baronsmariani.org/api/corsica/context'));
 assert.equal(r.status,503);assert.equal((await r.json()).error,'deno_runtime_unavailable');
});
