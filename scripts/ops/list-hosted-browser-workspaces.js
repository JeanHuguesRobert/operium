#!/usr/bin/env node
/**
 * Read-only, redacted inventory adapted from Operium PR #48/#50.
 * Never source .env files or return URLs/passwords; no privileged reads added.
 * An inventory entry proves a configuration file, not a live authenticated user.
 */
import fs from "node:fs";
import path from "node:path";
const args=process.argv.slice(2);
const at=args.indexOf("--env-dir");
if(at>=0 && (!args[at+1]||args[at+1].startsWith("--")))throw Error("--env-dir requires a directory");
for(let i=0;i<args.length;i++){
 if(args[i]==="--env-dir"){i++;continue;}
 if(args[i]!=="--json")throw Error("unsupported option");
}
const root=path.resolve(at>=0?args[at+1]:"/etc/operium/hosted-browser");
let names=[];
try{names=fs.readdirSync(root).filter(name=>/^hosted-[a-z0-9]+\.env$/.test(name)).sort();}
catch(error){if(error.code!=="ENOENT")throw error;}
const workspaces=[];
for(const name of names){
 const file=path.join(root,name);
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.size>16384)continue;
 const body=fs.readFileSync(file,"utf8");
 const find=(key)=>body.split(/\r?\n/).find(line=>line.startsWith(key+"="))?.slice(key.length+1).trim()??"";
 const display=find("HOSTED_BROWSER_DISPLAY");
 if(!/^[1-9][0-9]?$/.test(display))continue;
 const session=find("HOSTED_SESSION");
 const assurance=find("HOSTED_ASSURANCE");
 workspaces.push({
  name:name.slice(0,-4),display:Number(display),
  session:["kiosk","desktop"].includes(session)?session:"unknown",
  assurance:["lab-sesame","mesh-session","future-idp"].includes(assurance)?assurance:"unknown",
 });
}
const result={schema:"operium.hosted-workspace.inventory.v1",scope:"local-config-only",count:workspaces.length,workspaces};
if(args.includes("--json"))console.log(JSON.stringify(result));
else console.log(workspaces.map(x=>[x.name,"display=:"+x.display,"session="+x.session,"assurance="+x.assurance].join(" ")).join("\n")||"no configured workspaces");
