import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import {probeRfb,probeHttps} from './ops/hosted-browser-functional-probe.js';

async function withServer(handler,task){
 const server=net.createServer(handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{return await task(server.address().port);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
await withServer(socket=>socket.end('RFB 003.008\n'),async port=>{
 const result=await probeRfb({port});
 assert.equal(result.status,'responsive');assert.equal(result.verified,'protocol-only');
});
await withServer(socket=>{
 socket.write('RFB 003.');
 setImmediate(()=>socket.end('008\\n'));
},async port=>{
 assert.equal((await probeRfb({port})).status,'responsive');
});
await withServer(socket=>socket.end('HELLO WORLD!'),async port=>{
 assert.equal((await probeRfb({port})).reason,'invalid_banner');
});
await withServer(()=>{},async port=>{
 const result=await probeRfb({port,timeoutMs:100});
 assert.equal(result.reason,'timeout');
});
const closed=await withServer(()=>{},async port=>port);
assert.equal((await probeRfb({port:closed,timeoutMs:100})).status,'failed');
assert.equal((await probeHttps({port:closed,timeoutMs:100})).status,'failed');
console.log('Hosted Browser read-only protocol probes: passed');
