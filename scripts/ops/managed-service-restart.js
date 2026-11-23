#!/usr/bin/env node
import {runManagedRestart,validateRestartPlan} from "../../lib/ops/managed-service-restart.js";
const argv=process.argv.slice(2);
const arg=n=>argv.includes(n)?argv[argv.indexOf(n)+1]:undefined;
try{
 const plan=validateRestartPlan({ticket:arg("--ticket"),service:arg("--service"),
   expectedWorkingDirectory:arg("--expected-cwd"),healthUrl:arg("--health"),
   receiptDir:arg("--receipt-dir")});
 if(!argv.includes("--apply")){
  console.log(JSON.stringify({plan,applied:false,
   hint:"Launch this worker with systemd-run as a separate unit, not from the service being restarted."},null,2));
 }else{
  const result=await runManagedRestart(plan);
  console.log(JSON.stringify({state:result.state,receipt:result.receipt},null,2));
  if(result.state!=="verified")process.exitCode=1;
 }
}catch(e){console.error("RESTART_REJECTED "+e.message);process.exitCode=2}
