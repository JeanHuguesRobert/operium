#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const sourcePath=fileURLToPath(new URL("../templates/hosted-browser/start-hosted-browser.sh",import.meta.url));
const source=fs.readFileSync(sourcePath,"utf8");
assert.match(source,/HOSTED_SESSION:-kiosk/);
assert.match(source,/run-browser.sh/);
assert.match(source,/supervise-hosted-browser.sh/);
assert.match(source,/openbox-desktop-rc.xml/);
assert.match(source,/openbox-kiosk-rc.xml/);
assert.match(source,/-interface 127\.0\.0\.1/);
assert.match(source,/-PasswordFile/);
assert.doesNotMatch(source,/-SecurityTypes[ \t]+None/);
assert.match(source,/invalid workspace Unix key/);
assert.match(source,/printf -v q_start_url '%q'/);

const lines=source.split("\n");
const start=lines.findIndex(x=>x.startsWith("# Shell-quote inherited env values"));
const end=lines.findIndex((x,i)=>i>start&&x.includes("/run-browser.sh")&&x.includes("<<EOF"));
assert.ok(start>=0&&end>start);
const setup=lines.slice(start,end).join("\n");
const exports=lines.slice(end+2).filter(x=>x.startsWith("export HOSTED_"));
assert.equal(exports.length,9);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"operium-launcher-quote-"));
try {
 const pwn=path.join(tmp,"would_execute");
 const injected="https://example.invalid/\";touch "+pwn+";echo \"$(id)";
 const generated=path.join(tmp,"runner.sh");
 const snippet=setup+"\ncat > \"$TEST_RUNNER\" <<EOF\n#!/usr/bin/env bash\n"+
   exports.join("\n")+"\nEOF\n";
 const env={...process.env,
  TEST_RUNNER:generated,HOME_DIR:tmp,BROWSER_BIN:"/usr/bin/false",
  USER_DATA_DIR:path.join(tmp,"profile"),START_URL:injected,CDP_PORT:"9223",
  CHROME_RESTART:"on-exit",COOLDOWN:"5",
  HOSTED_BROWSER_MAX_CRASH_STREAK:"4",
  HOSTED_BROWSER_LOAD_EXTENSION:""
 };
 const render=spawnSync("bash",["-c",snippet],{encoding:"utf8",env,timeout:3000});
 assert.equal(render.status,0,render.stderr);
 const syntax=spawnSync("bash",["-n",generated],{encoding:"utf8",timeout:2000});
 assert.equal(syntax.status,0,syntax.stderr);
 const evaluate=spawnSync("bash",["-c",'source "$1"; printf "%s" "$HOSTED_BROWSER_START_URL"',"--",generated],{encoding:"utf8",timeout:3000});
 assert.equal(evaluate.status,0,evaluate.stderr);
 assert.equal(evaluate.stdout,injected);
 assert.equal(fs.existsSync(pwn),false,"untrusted URL must not execute commands");
 console.log("hosted-browser launcher source/auth and shell escaping regression: PASS");
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
