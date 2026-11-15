#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const script=fileURLToPath(new URL("./ops/hosted-workspace-policy.sh",import.meta.url));
const check=(...args)=>spawnSync("bash",[script,...args],{encoding:"utf8",timeout:2500});
const ok=check("check","--session","kiosk","--assurance","lab-sesame");
assert.equal(ok.status,0,ok.stderr);
assert.match(ok.stdout,/allow-advisory/);
for(const assurance of ["lab-sesame","mesh-session","future-idp"])
 for(const bind of ["public","mesh"])
  for(const waiver of ["none","principal-lab"]){
   const res=check("check","--session","desktop","--assurance",assurance,"--bind",bind,"--waiver",waiver);
   assert.equal(res.status,75,[assurance,bind,waiver,res.stderr].join(" "));
   assert.match(res.stdout,/deny/);
  }
for(const session of ["kiosk","desktop"]){
 const res=check("check","--session",session,"--assurance","future-idp","--host-admin","request");
 assert.equal(res.status,75);assert.match(res.stdout,/host administration/);
}
for(const args of [
 [],
 ["check","--session","desktop","--assurance","unverified"],
 ["check","--session","kiosk","--assurance","lab-sesame","--waiver","free-pass"],
 ["check","--session","kiosk"],
 ["check","--session","desktop","--assurance","lab-sesame","--bind","other"]
])assert.equal(check(...args).status,64);
console.log("hosted-workspace policy advisory/denial matrix: PASS");
