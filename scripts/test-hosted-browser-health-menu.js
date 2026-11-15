#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const menu=fileURLToPath(new URL("../templates/hosted-browser/openbox-health-pipemenu.sh",import.meta.url));
const desktop=fileURLToPath(new URL("../templates/hosted-browser/openbox-desktop-menu.xml",import.meta.url));
const desktopXml=fs.readFileSync(desktop,"utf8");
assert.match(desktopXml,/openbox-health-pipemenu\.sh/);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"operium-health-menu-"));
try {
 const res=spawnSync("bash",[menu],{env:{...process.env,HOME:tmp},encoding:"utf8",timeout:16000});
 assert.equal(res.status,0,res.stderr);
 assert.match(res.stdout,/openbox_pipe_menu/);
 assert.doesNotMatch(res.stdout,/(password=|token=|service_role)/i);
 const parsed=spawnSync("python3",["-c","import sys,xml.etree.ElementTree as E; r=E.fromstring(sys.stdin.read()); assert r.tag=='openbox_pipe_menu'; assert len(r)>=3"],{input:res.stdout,encoding:"utf8",timeout:3000});
 assert.equal(parsed.status,0,parsed.stderr);
 console.log("Openbox hosted-browser health menu XML: PASS");
} finally {fs.rmSync(tmp,{recursive:true,force:true});}
