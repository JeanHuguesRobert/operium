import test from 'node:test';import assert from 'node:assert/strict';
import {createJhnNodePilot} from './jhn-node-pilot.js';
test('actual JHN Node function: local host answers 405 without downloading or modifying anything',async()=>{
 const server=createJhnNodePilot({port:0});const addr=await server.listen();
 try{
 const origin=`http://127.0.0.1:${addr.port}`;
 const rejected=await fetch(`${origin}/cc/requete-conseil-constitutionnel-haute-corse-2026.pdf`,{method:'POST'});
 assert.equal(rejected.status,405);assert.equal(rejected.headers.get('allow'),'GET');
 assert.equal(await rejected.text(),'Method not allowed');
 assert.equal((await fetch(`${origin}/api/cop/principal-consent/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`)).status,404);
 }finally{await server.close()}
});
