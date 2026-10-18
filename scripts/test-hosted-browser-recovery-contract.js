import assert from 'node:assert/strict';
import {decideRfbRecovery} from '../lib/hosted-browser-recovery-contract.js';

const baseline = {revision:'aabbccdd',unit:'hosted-browser-rfb@hosted-jeanhuguesrobert.service'};
const current = {...baseline,parent_browser_active:true};
const mandate = {allow_rfb_restart:true};
const sessions = {impact_known:true,active_clients:0};
const probes = {local_rfb:'failed',local_https:'responsive'};
const valid = {baseline,current,mandate,sessions,probes};
assert.equal(decideRfbRecovery(valid).decision,'eligible');
assert.equal(decideRfbRecovery(valid).max_attempts,1);
const blocked = (change,reason) =>
 assert.equal(decideRfbRecovery({...valid,...change}).reason,reason);
blocked({mandate:{}},'restart_not_authorized');
blocked({current:{...current,revision:'changed'}},'baseline_drift_or_unknown');
blocked({sessions:{impact_known:false}},'client_impact_unknown');
blocked({sessions:{impact_known:true,active_clients:1}},'active_rfb_clients');
blocked({attempts:1},'recovery_budget_exhausted');
blocked({probes:{...probes,local_rfb:'responsive'}},'no_confirmed_local_rfb_failure');
blocked({probes:{...probes,local_https:'failed'}},'parent_https_failure_outside_rfb_scope');
blocked({current:{...current,parent_browser_active:false}},'parent_browser_not_active');
console.log('RFB recovery contract tests passed');
