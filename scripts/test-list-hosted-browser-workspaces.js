#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const script=fileURLToPath(new URL("./ops/list-hosted-browser-workspaces.js",import.meta.url));
const root=fs.mkdtempSync(path.join(os.tmpdir(),"operium-inventory-fixture-"));
try {
 fs.writeFileSync(path.join(root,"hosted-guest.env"),"HOSTED_BROWSER_DISPLAY=2\nHOSTED_SESSION=kiosk\nHOSTED_ASSURANCE=lab-sesame\nHOSTED_BROWSER_START_URL=https://secret.example/private?token=SECRET_NEVER_LOG\nPASSWORD=SECRET_NEVER_LOG\n");
 fs.writeFileSync(path.join(root,"hosted-owner.env"),"HOSTED_BROWSER_DISPLAY=1\nHOSTED_SESSION=desktop\nHOSTED_ASSURANCE=future-idp\n");
 fs.writeFileSync(path.join(root,"hosted-invalid.env"),"HOSTED_BROWSER_DISPLAY=abc\n");
 fs.writeFileSync(path.join(root,"hosted-owner.sh"),"PASSWORD=SECRET_NEVER_LOG\n");
 const p=spawnSync(process.execPath,[script,"--env-dir",root,"--json"],{encoding:"utf8",timeout:3000});
 assert.equal(p.status,0,p.stderr);
 assert.doesNotMatch(p.stdout,/SECRET_NEVER_LOG|secret\.example|PASSWORD/);
 const x=JSON.parse(p.stdout);
 assert.equal(x.count,2);
 assert.deepEqual(x.workspaces.map(y=>[y.name,y.display,y.session,y.assurance]),[
 ["hosted-guest",2,"kiosk","lab-sesame"],
 ["hosted-owner",1,"desktop","future-idp"]
 ]);
 assert.equal(x.scope,"local-config-only");
 const absent=spawnSync(process.execPath,[script,"--env-dir",path.join(root,"absent"),"--json"],{encoding:"utf8"});
 assert.equal(absent.status,0);
 assert.equal(JSON.parse(absent.stdout).count,0);
 console.log("hosted-workspace inventory privacy and validation: PASS");
} finally {fs.rmSync(root,{recursive:true,force:true});}
