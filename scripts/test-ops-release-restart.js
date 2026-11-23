import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {checkNodeRelease} from "../lib/ops/release-preflight.js";
import {spawnSync} from "node:child_process";
import {validateRestartPlan,runManagedRestart} from "../lib/ops/managed-service-restart.js";
import {auditPendingReservations} from "../lib/ops/cop-pending-audit.js";
test("release preflight imports modules from their actual source; syntax-only success is insufficient",async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"operium-release-fbf-"));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const lock=path.join(dir,"package-lock.json"),module=path.join(dir,"config.mjs");
 await writeFile(lock,JSON.stringify({packages:{"node_modules/demo":{version:"1.2.3"}}}));
 await writeFile(module,"import 'missing_release_runtime_dep'; export const ready = true;\n");
 const missing=await checkNodeRelease({importModules:[module],lockfile:lock,dependencies:{demo:"1.2.3"}});
 assert.equal(missing.code,"RUNTIME_IMPORT_FAILED");
 const mismatch=await checkNodeRelease({importModules:[module],lockfile:lock,dependencies:{demo:"1.3.0"}});
 assert.equal(mismatch.code,"LOCKFILE_VERSION_MISMATCH");
 await writeFile(module,"export const ready = true;\n");
 const good=await checkNodeRelease({importModules:[module],lockfile:lock,dependencies:{demo:"1.2.3"}});
 assert.equal(good.ok,true);
});
test("restart receipt survives lost initiating caller and forbids duplicate tickets",async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"operium-restart-receipt-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const plan={ticket:"fixture_restart_2026",service:"mcp-cogentia.service",expectedWorkingDirectory:dir,
 healthUrl:"http://127.0.0.1:8791/health",receiptDir:dir};
 let pid=21,restarted=0;
 const adapter={active:()=>true,cwd:()=>dir,pid:()=>pid,
 restart:()=>{restarted++;pid=22},healthy:async()=>true};
 const result=await runManagedRestart(plan,{adapter,sleep:async()=>{}});
 assert.equal(result.state,"verified");assert.equal(restarted,1);
 assert.equal(JSON.parse(await readFile(result.receipt)).observed_after.pid,22);
 await assert.rejects(()=>runManagedRestart(plan,{adapter,sleep:async()=>{}}),{code:"EEXIST"});
 assert.equal(restarted,1);
 const broken=await runManagedRestart({...plan,ticket:"fixture_broken_2026"},{
 adapter:{...adapter,healthy:async()=>false,restart:()=>{restarted++;pid=23}},sleep:async()=>{}});
 assert.equal(broken.state,"attention_required");
 assert.equal(JSON.parse(await readFile(broken.receipt)).error,"SERVICE_POSTCONDITION_FAILED");
});
test("only loopback health and exact service/cwd are admitted",()=>{
 const valid={ticket:"valid_restart_2026",service:"cogentia.service",expectedWorkingDirectory:"/srv/code",
  healthUrl:"http://127.0.0.1:8791/health",receiptDir:"/tmp/ops-receipts"};
 assert.equal(validateRestartPlan(valid).service,"cogentia.service");
 for(const changed of [{service:"cogentia.service;rm -rf /"},{healthUrl:"https://example.org/health"},
  {healthUrl:"http://127.0.0.1:8791/health#bad"},{expectedWorkingDirectory:"../relative"}]){
  assert.throws(()=>validateRestartPlan({...valid,...changed}));
 }
});
test("pending COP reservations never convert age alone into settlement",()=>{
 const reservation=(id,date)=>({event_type:"ExecutionBudgetReservation",time:{recorded_at:date},
  payload:{reservation:{reservation_id:id,idempotency_key:id,demand:{max_steps:1}}}});
 const events=[reservation("a","2026-11-17T00:00:00Z"),
 reservation("b","2026-11-23T23:00:00Z"),reservation("c","2026-11-17T00:00:00Z"),
 {event_type:"ExecutionBudgetSettlement",payload:{reservation_id:"c"}}];
 const x=auditPendingReservations(events,{asOf:"2026-11-23T23:30:00Z"});
 assert.equal(x.total_pending,2);assert.equal(x.aged_count,1);assert.equal(x.pending_steps,2);
 assert.equal(x.items[0].decision,"no_mutation_without_effect_witness");
});

test("release-preflight CLI actually resolves and imports each module",async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),"operium-release-cli-"));t.after(()=>rm(dir,{recursive:true,force:true}));
 const lock=path.join(dir,"package-lock.json"),module=path.join(dir,"config.mjs");
 await writeFile(lock,JSON.stringify({packages:{"node_modules/example":{version:"1.0.0"}}}));
 await writeFile(module,"export const active = true;\n");
 const run=()=>spawnSync(process.execPath,["scripts/ops/release-preflight.js",
  "--lock",lock,"--dependency","example@1.0.0","--import",module],
  {cwd:path.resolve(import.meta.dirname,".."),encoding:"utf8",timeout:10000});
 const ok=run();assert.equal(ok.status,0,ok.stderr);
 assert.equal(JSON.parse(ok.stdout).ok,true);
 await writeFile(module,"import 'not-a-real-runtime-dependency-xyz';\n");
 const fail=run();assert.equal(fail.status,1,fail.stderr);
 assert.equal(JSON.parse(fail.stdout).code,"RUNTIME_IMPORT_FAILED");
});
