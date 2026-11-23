import {mkdir,open,writeFile} from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
const validUnit=x=>typeof x==="string"&&/^[A-Za-z0-9_.@-]+\.service$/.test(x);
const validTicket=x=>typeof x==="string"&&/^[a-zA-Z0-9_-]{12,90}$/.test(x);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function validateRestartPlan({ticket,service,expectedWorkingDirectory,healthUrl,receiptDir}={}){
 if(!validTicket(ticket)||!validUnit(service)||!path.isAbsolute(expectedWorkingDirectory||"")||
   !path.isAbsolute(receiptDir||""))throw Error("INVALID_RESTART_SCOPE");
 const u=new URL(healthUrl);
 if(u.protocol!=="http:"||!["127.0.0.1","[::1]"].includes(u.hostname)||
   u.username||u.password||u.hash)throw Error("HEALTH_MUST_BE_LOOPBACK_HTTP");
 return {ticket,service,expectedWorkingDirectory,healthUrl:u.href,receiptDir};
}
export function defaultSystemdAdapter(){
 const systemctl=(...args)=>execFileSync("systemctl",args,{encoding:"utf8",timeout:20000}).trim();
 return {active:unit=>systemctl("is-active",unit)==="active",
  pid:unit=>Number(systemctl("show",unit,"--property=MainPID","--value")),
  cwd:unit=>systemctl("show",unit,"--property=WorkingDirectory","--value"),
  restart:unit=>systemctl("restart",unit),
  async healthy(url){
   const r=await fetch(url,{signal:AbortSignal.timeout(5000)});
   if(!r.ok)return false;return (await r.json()).ok===true;
  }};
}
/** Must run outside the service being restarted. The stable receipt is
 * independently recoverable after its initiating MCP connection disappears.
 */
export async function runManagedRestart(plan,{adapter=defaultSystemdAdapter(),
  sleep=wait,now=()=>new Date().toISOString()}={}){
 const p=validateRestartPlan(plan);
 await mkdir(p.receiptDir,{recursive:true,mode:0o700});
 const receipt=path.join(p.receiptDir,p.ticket+".json");
 const fd=await open(receipt,"wx",0o600); // Never replay the same restart.
 let state={schema:"operium.managed-restart-receipt.v1",ticket:p.ticket,service:p.service,
  expectedWorkingDirectory:p.expectedWorkingDirectory,healthUrl:p.healthUrl,
  started_at:now(),state:"prepared",observed_before:null,observed_after:null};
 const persist=async()=>{await writeFile(receipt,JSON.stringify(state,null,2)+"\n",{mode:0o600})};
 try{
  await persist();
  if(!adapter.active(p.service)||adapter.cwd(p.service)!==p.expectedWorkingDirectory)
   throw Error("SERVICE_BASELINE_MISMATCH");
  state.observed_before={pid:adapter.pid(p.service)};
  state.state="executing";await persist();
  await adapter.restart(p.service);
  await sleep(2500);
  const pid=adapter.pid(p.service);
  if(!adapter.active(p.service)||pid<=0||pid===state.observed_before.pid||
    adapter.cwd(p.service)!==p.expectedWorkingDirectory||
    !(await adapter.healthy(p.healthUrl)))
   throw Error("SERVICE_POSTCONDITION_FAILED");
  state.observed_after={pid,healthy:true};
  state.state="verified";state.completed_at=now();await persist();
 }catch(e){state.state="attention_required";state.error=e.message;state.completed_at=now();await persist()}
 finally{await fd.close()}
 return {receipt,...state};
}
