#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const script=fileURLToPath(new URL("./ops/configure-hosted-browser-workspace.sh",import.meta.url));
const root=fs.mkdtempSync(path.join(os.tmpdir(),"operium-workspace-config-"));
try {
 const file=path.join(root,"hosted-synthetic.env");
 const initial="HOSTED_BROWSER_DISPLAY=7\nHOSTED_BROWSER_START_URL=https://example.invalid/\nPRIVATE_SENTINEL=SHOULD_NOT_BE_EMITTED\n";
 fs.writeFileSync(file,initial,{mode:0o600});
 const run=(args)=>spawnSync("bash",[script,...args],{encoding:"utf8",timeout:3500,
  env:{...process.env,OPERIUM_HOSTED_BROWSER_ENV_DIR:root}});
 const plan=run(["--unix","hosted-synthetic","--session","kiosk","--assurance","lab-sesame","--bind","public","--dry-run","--restart"]);
 assert.equal(plan.status,0,plan.stderr);
 assert.match(plan.stdout,/session=kiosk/);
 assert.match(plan.stdout,/hosted-synthetic\.service/);
 assert.doesNotMatch(plan.stdout,/SHOULD_NOT_BE_EMITTED/);
 assert.equal(fs.readFileSync(file,"utf8"),initial);
 const forbidden=run(["--unix","hosted-synthetic","--session","desktop","--assurance","lab-sesame","--bind","public","--waiver","principal-lab","--dry-run"]);
 assert.equal(forbidden.status,75);
 assert.match(forbidden.stdout,/deny/);
 assert.equal(fs.readFileSync(file,"utf8"),initial);
 const invalid=run(["--unix","hosted-synthetic","--session","kiosk","--cooldown","999","--dry-run"]);
 assert.equal(invalid.status,64);
 assert.equal(fs.readFileSync(file,"utf8"),initial);
 const badUnix=run(["--unix","../../somewhere","--dry-run"]);
 assert.equal(badUnix.status,64);
 console.log("hosted-workspace config dry-run and strict policy: PASS");
} finally {fs.rmSync(root,{recursive:true,force:true});}
