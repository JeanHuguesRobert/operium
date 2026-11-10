/** Read-only evidence that the original Inseme instance Vault is accessible.
 * Never prints the URL, credentials, value_json, value or secret contents.
 */
import {loadInstanceConfig} from '../../../inseme/packages/cop-host/src/config/instanceConfig.edge.js';
try{
 const rows=await loadInstanceConfig();
 if(!rows||typeof rows!=='object'||!Object.keys(rows).length)throw Error('vault_empty_or_unreachable');
 const required=['nasa_principal_subject','nasa_operator_subjects','interactions_desk_principal_subject','jhn_cop_capability','openai_api_key','jhn_cop_event_url'];
 const ready=Object.fromEntries(required.map(k=>[k,!!(rows[k]?.value_json??rows[k]?.value)]));
 console.log(JSON.stringify({schema:'fractafunction.jhn_vault_probe.v1',accessible:true,
  config_row_count:Object.keys(rows).length,required_present:ready}));
}catch(error){
 console.error(JSON.stringify({schema:'fractafunction.jhn_vault_probe.v1',accessible:false,
  error_class:error?.name||'Error'}));
 Deno.exit(1);
}
