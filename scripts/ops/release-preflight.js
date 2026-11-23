#!/usr/bin/env node
import {checkNodeRelease} from "../../lib/ops/release-preflight.js";
import path from "node:path";
const argv=process.argv.slice(2);
function values(k){const out=[];for(let i=0;i<argv.length;i++)if(argv[i]===k&&argv[i+1])out.push(argv[++i]);return out}
try{
 const deps=Object.fromEntries(values("--dependency").map(value=>{
  const idx=value.lastIndexOf("@");if(idx<=0)throw Error("INVALID_DEPENDENCY_ARGUMENT");
  return [value.slice(0,idx),value.slice(idx+1)];
 }));
 const lock=values("--lock");
 if(lock.length!==1)throw Error("LOCKFILE_REQUIRED");
 const r=await checkNodeRelease({importModules:values("--import").map(x=>path.resolve(x)),
  lockfile:path.resolve(lock[0]),dependencies:deps});
 console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;
}catch(e){console.error("PREFLIGHT_REJECTED "+e.message);process.exitCode=2}
