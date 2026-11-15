#!/usr/bin/env node
/** Recovered PR #74 boundary checks against the canonical CI supervisor. */
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
const script=fileURLToPath(new URL("./ops/supervise-ci-result.js",import.meta.url));
const root=fs.mkdtempSync(path.join(os.tmpdir(),"operium-supervisor-reconcile-"));
const run=(name,code,timeoutMs=6000)=>{
  const out=path.join(root,name);
  const result=spawnSync(process.execPath,[script,"--out",out,"--phase",name,"--timeout-ms",String(timeoutMs),"--",process.execPath,"-e",code],{encoding:"utf8",timeout:12000});
  assert.equal(result.status,0,result.stderr);
  const receipt=JSON.parse(fs.readFileSync(path.join(out,"result.json"),"utf8"));
  assert.equal(receipt.schema,"operium.supervised-result/v1");
  assert.equal(receipt.phase,name);
  assert.ok(fs.existsSync(path.join(out,"test.log")));
  return {receipt,log:fs.readFileSync(path.join(out,"test.log"),"utf8")};
};
try{
  const ok=run("success","console.log('supervised-success')");
  assert.equal(ok.receipt.passed,true);
  assert.equal(ok.receipt.exit_code,0);
  assert.match(ok.log,/supervised-success/);
  const bad=run("failure","process.exit(17)");
  assert.equal(bad.receipt.passed,false);
  assert.equal(bad.receipt.exit_code,17);
  const timeout=run("timeout","setTimeout(()=>{},15000)",150);
  assert.equal(timeout.receipt.passed,false);
  assert.equal(timeout.receipt.error,"task_timeout");
  const invalid=spawnSync(process.execPath,[script,"--out",path.join(root,"bad"),"--timeout-ms","-1","--",process.execPath,"-e","process.exit(0)"],{encoding:"utf8"});
  assert.equal(invalid.status,1);
  console.log("operium canonical CI supervisor reconciliation: PASS");
} finally { fs.rmSync(root,{recursive:true,force:true}); }
