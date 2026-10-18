import assert from 'node:assert/strict';
import {observeHostedBrowser} from './ops/hosted-browser-observe.js';

const respond = surface => async () => ({surface,status:'responsive',verified:'protocol-only'});
const fail = surface => async () => ({surface,status:'failed',reason:'timeout'});
const healthy = await observeHostedBrowser({rfb:respond('rfb'),https:respond('https')});
assert.equal(healthy.ok,true);
assert.equal(healthy.state,'PROTOCOL_RESPONSIVE');
assert.equal(healthy.functional_session,'UNVERIFIED');
assert.equal(healthy.recovery,'NOT_ATTEMPTED');
assert.equal(healthy.verified,'protocol-and-listener-only');
const failing = await observeHostedBrowser({rfb:fail('rfb'),https:respond('https')});
assert.equal(failing.ok,false);
assert.equal(failing.state,'DEGRADED');
assert.equal(failing.observations.rfb.reason,'timeout');
const httpsFail = await observeHostedBrowser({rfb:respond('rfb'),https:fail('https')});
assert.equal(httpsFail.ok,false);
assert.equal(httpsFail.functional_session,'UNVERIFIED');
console.log('Hosted Browser observation contract tests passed');
