#!/usr/bin/env node
import assert from 'node:assert/strict';
import {buildFleet,FLEET_NODES} from '../lib/node-agent/nasa-portal.js';

const originalFetch=globalThis.fetch;
let remoteAttempts=0;
try{
  // Fully synthetic observation: only the observer responds. All other
  // peers hang. A control-room read must still complete within its
  // bounded deadline and MUST NOT label unobserved peers as offline.
  globalThis.fetch=async (input)=>{
    const u=new URL(typeof input==='string'?input:input.url);
    if(u.hostname==='127.0.0.1'){
      return {ok:true,status:200,text:async()=>JSON.stringify({
        ok:true,hostname:'fracta2',health_score:5})};
    }
    remoteAttempts++;
    return new Promise(()=>{});
  };
  const config={hostname:'fracta2',nodeId:'resource://fracta2',
    port:8794,nasaFleetDeadlineMs:250};
  const start=Date.now();
  const result=await buildFleet(config);
  const elapsed=Date.now()-start;
  assert.equal(result.nodes.length,FLEET_NODES.length);
  assert.ok(!result.nodes.some(n=>n.host==='fracta'), 'destroyed node must not be probed');
  assert.ok(elapsed<1200,'fleet read stalled for '+elapsed+'ms');
  const self=result.nodes.find(n=>n.host==='fracta2');
  assert.equal(self.online,true);
  for(const n of result.nodes.filter(n=>n.host!=='fracta2')){
    assert.equal(n.online,null,'unobserved peer must stay uncertain: '+n.host);
    assert.equal(n.observation_state,'unconfirmed');
    assert.equal(n.error,'probe_deadline');
  }
  assert.ok(remoteAttempts>=1);
  console.log(JSON.stringify({ok:true,elapsed_ms:elapsed,nodes:result.nodes.length,
    unconfirmed:result.nodes.filter(n=>n.online===null).length,
    observer_online:true}));
}finally{globalThis.fetch=originalFetch}
