import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** An isolated source release must import its actual runtime dependencies.
 * Syntax checks cannot detect missing packages. Pass only safe modules:
 * importing a runnable server executable may start a server.
 */
export async function checkNodeRelease({importModules=[],lockfile,dependencies={},
  node=process.execPath,timeoutMs=12000}={}){
 if(!Array.isArray(importModules)||!importModules.length||
    importModules.some(s=>typeof s!=="string"||!path.isAbsolute(s)))
   throw Error("ABSOLUTE_SIDE_EFFECT_FREE_MODULE_REQUIRED");
 if(typeof lockfile!=="string"||!path.isAbsolute(lockfile))throw Error("LOCKFILE_REQUIRED");
 const lock=JSON.parse(await readFile(lockfile,"utf8")),found=[];
 for(const [pkg,expected] of Object.entries(dependencies)){
  if(!/^(?:@[\w.-]+\/)?[\w.-]+$/.test(pkg)||!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(expected))
   throw Error("INVALID_DEPENDENCY_PIN");
  const actual=lock.packages?.["node_modules/"+pkg]?.version;
  if(actual!==expected)return {ok:false,code:"LOCKFILE_VERSION_MISMATCH",package:pkg,expected,actual:actual??null};
  found.push({name:pkg,version:actual});
 }
 for(const module of importModules){
  if(!(await stat(module)).isFile())return {ok:false,code:"MODULE_NOT_FILE"};
  const child=spawnSync(node,["--input-type=module","--eval",
    "await import("+JSON.stringify(pathToFileURL(module).href)+");process.stdout.write('IMPORT_PASS')"],
    {encoding:"utf8",timeout:timeoutMs,env:{...process.env,PORT:"0"}});
  if(child.error||child.status!==0||child.stdout!=="IMPORT_PASS")
   return {ok:false,code:"RUNTIME_IMPORT_FAILED",module,exit_code:child.status,
     reason:child.error?.code??(child.stderr?.match(/ERR_[A-Z_]+/)||[])[0]??"IMPORT_ERROR"};
 }
 return {ok:true,code:"RELEASE_DEPENDENCIES_VERIFIED",modules:importModules.length,dependencies:found};
}
