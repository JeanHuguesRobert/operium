#!/usr/bin/env node
import {pathToFileURL} from "node:url";
import path from "node:path";
import {auditPendingReservations} from "../../lib/ops/cop-pending-audit.js";
const argv=process.argv.slice(2),arg=k=>argv.includes(k)?argv[argv.indexOf(k)+1]:undefined;
try{
 if(argv.includes("--apply"))throw Error("READ_ONLY_AUDITOR_NEVER_APPLIES_EFFECTS");
 const repo=path.resolve(arg("--inseme")??"/srv/cogentia/repos/inseme");
 const storePath=path.resolve(arg("--store")??"/var/lib/cogentia/cop/john-root-v1.sqlite");
 const budget=arg("--budget")??"budget:mandate:jhn:john-root";
 if(!/^budget:[a-zA-Z0-9_.:-]+$/.test(budget))throw Error("INVALID_BUDGET_ID");
 const {createSqliteCopEventStore}=await import(pathToFileURL(path.join(repo,"packages/cop-core/src/sqlite-cop-event-store.js")));
 const db=createSqliteCopEventStore(storePath);
 try{
  const report=auditPendingReservations(db.listTopic("execution-budget:"+budget),{
    minimumAgeHours:Number(arg("--age-hours")??24)});
  console.log(JSON.stringify({...report,budget_id:budget},null,2));
 }finally{db.close()}
}catch(e){console.error("COP_AUDIT_REJECTED "+e.message);process.exitCode=2}
