#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const script=fileURLToPath(new URL("../templates/hosted-browser/supervise-hosted-browser.sh",import.meta.url));
const root=fs.mkdtempSync(path.join(os.tmpdir(),"operium-browser-supervisor-test-"));
try {
 const browser=path.join(root,"fake-browser.sh");
 fs.writeFileSync(browser,"#!/bin/sh\nexit "+(process.platform==="win32"?"7":"7")+"\n",{mode:0o700});
 const home=path.join(root,"home");
 fs.mkdirSync(home);
 const profile=path.join(home,"profile");
 const log=path.join(home,"browser.log");
 const env={
  ...process.env,HOME:home,
  HOSTED_BROWSER_BINARY:browser,
  HOSTED_BROWSER_PROFILE_DIR:profile,
  HOSTED_BROWSER_SUPERVISOR_LOG:log,
  HOSTED_BROWSER_SUPERVISOR_PID:path.join(home,"pid"),
  HOSTED_BROWSER_CLEAR_LOCKS:"never",
  HOSTED_BROWSER_START_URL:"https://example.invalid/",
  HOSTED_BROWSER_CDP_PORT:"9231",
  HOSTED_CHROME_RESTART:"on-exit",
  HOSTED_CHROME_COOLDOWN_SECONDS:"1",
  HOSTED_BROWSER_HEALTHY_SECONDS:"45",
  HOSTED_BROWSER_MAX_CRASH_STREAK:"2",
  HOSTED_SUPERVISE_MAX_RUNS:"2",
 };
 const fail=spawnSync("bash",[script],{env,encoding:"utf8",timeout:9000});
 assert.equal(fail.status,0,fail.stderr);
 const events=fs.readFileSync(log,"utf8");
 assert.match(events,/event=supervisor_start/);
 assert.match(events,/event=start run=1/);
 assert.match(events,/event=exit run=1 code=7/);
 assert.match(events,/event=exit run=2 code=7/);
 assert.match(events,/event=stop reason=crash_streak/);
 assert.doesNotMatch(events,/https:\/\/example\.invalid\/|PASSWORD/);
 assert.equal(fs.existsSync(path.join(home,"pid")),false,"pid file must be removed");

 const once=spawnSync("bash",[script],{env:{
  ...env,
  HOSTED_BROWSER_SUPERVISOR_LOG:path.join(home,"once.log"),
  HOSTED_CHROME_RESTART:"off",
  HOSTED_BROWSER_MAX_CRASH_STREAK:"3"
 },encoding:"utf8",timeout:9000});
 assert.equal(once.status,7,"restart-off retains failing exit code");
 const onceLog=fs.readFileSync(path.join(home,"once.log"),"utf8");
 assert.equal((onceLog.match(/event=start run=/g)||[]).length,1);
 assert.match(onceLog,/event=stop reason=restart_off code=7/);
 console.log("hosted-browser bounded supervisor regression: PASS");
} finally {
 fs.rmSync(root,{recursive:true,force:true});
}
