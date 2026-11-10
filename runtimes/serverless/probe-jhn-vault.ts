/** Read-only evidence that the original Inseme instance Vault is accessible.
 * Never prints the URL, credentials, value_json, value or secret contents.
 */
import {loadInstanceConfig,getAllConfigKeys,resolveInstanceId,getConfig} from '../../../inseme/packages/cop-host/src/config/instanceConfig.edge.js';
try{
 const rows=await loadInstanceConfig();
 if(!rows||typeof rows!=='object'||!Object.keys(rows).length)throw Error('vault_empty_or_unreachable');
 const required=['nasa_principal_subject','nasa_operator_subjects','interactions_desk_principal_subject','jhn_cop_capability','openai_api_key','jhn_cop_event_url'];
 const ready=Object.fromEntries(required.map(k=>[k,!!(rows[k]?.value_json??rows[k]?.value)]));
 // A named instance may have keys absent from the flattened root table.
 // Report only key presence and whether an alias resolves; no identifiers or values.
 const instanceNames=['jhn','john'];
 const instancePresence=Object.fromEntries(instanceNames.map(name=>{
  const keys=new Set(getAllConfigKeys(name));
  return [name,{alias_resolves:resolveInstanceId(name)!==name,
    required_keys_present:Object.fromEntries(required.map(k=>[k,keys.has(k)])),
    resolved_nonempty:Object.fromEntries(required.map(k=>[k,!!getConfig(k,undefined,name)]))}];
 }));
 console.log(JSON.stringify({schema:'fractafunction.jhn_vault_probe.v1',accessible:true,
  config_row_count:Object.keys(rows).length,required_present:ready,instance_key_presence:instancePresence}));
}catch(error){
 console.error(JSON.stringify({schema:'fractafunction.jhn_vault_probe.v1',accessible:false,
  error_class:error?.name||'Error'}));
 Deno.exit(1);
}
