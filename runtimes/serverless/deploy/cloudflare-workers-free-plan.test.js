import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inferWorkersFreePlan} from './cloudflare-workers-free-plan.js';
const free = {accountTokenActive:true,subscriptionsOk:true,
  subscriptions:[],workersSettingsOk:true};
test('empty verified account subscriptions with active token and worker settings -> Free',()=>{
  assert.equal(inferWorkersFreePlan(free),true);
});
test('unknown/failed billing or token access must not authorize inference',()=>{
  for(const override of [
    {accountTokenActive:false},
    {subscriptionsOk:false},
    {subscriptions:null},
    {subscriptions:[{rate_plan:{id:'WORKERS_PAID'}}]},
    {workersSettingsOk:false},
    {subscriptions:'[]'},
  ]) assert.equal(inferWorkersFreePlan({...free,...override}),false);
});
