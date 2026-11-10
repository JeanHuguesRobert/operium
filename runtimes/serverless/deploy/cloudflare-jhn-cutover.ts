/** Purpose-specific Cloudflare JHN CNAME -> Fracta2 A cutover and rollback.
 * The token comes from existing Inseme instance Vault; never logged/persisted.
 * No wildcard record or other zone modifications; fail closed on drift.
 */
import {loadInstanceConfig,getConfig} from '../../../../inseme/packages/cop-host/src/config/instanceConfig.edge.js';
const DOMAIN='jhn.baronsmariani.org',ZONE='baronsmariani.org';
const NETLIFY='jhn-baronsmariani-org.netlify.app',FRACTA2='82.70.234.207';
const action=Deno.args[0]||'audit';
if(!['audit','apply','rollback'].includes(action))throw Error('unknown_operation');
await loadInstanceConfig();
const secret=getConfig('cloudflare_api_key');
if(typeof secret!=='string'||!secret)throw Error('cloudflare_credential_not_configured');
async function cf(path:string,method='GET',data?:Record<string,unknown>){
 const response=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers:{Authorization:`Bearer ${secret}`,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 const payload=await response.json();
 if(!response.ok||payload.success!==true)throw Error('cloudflare_request_failed:'+response.status+':'+(payload.errors||[]).map((e:{code:number})=>e.code).join(','));
 return payload.result;
}
const zones=await cf('/zones?name='+ZONE);
if(!Array.isArray(zones)||zones.length!==1||zones[0].name!==ZONE||zones[0].status!=='active')throw Error('expected_one_active_zone');
const zone=zones[0].id;
const list=await cf(`/zones/${zone}/dns_records?name=${DOMAIN}&per_page=100`);
if(!Array.isArray(list)||list.length!==1)throw Error('expected_one_existing_dns_record');
const r=list[0];
if(r.name!==DOMAIN||r.proxied!==false||!['CNAME','A'].includes(r.type))throw Error('unexpected_record_type_or_proxy');
const isOld=r.type==='CNAME'&&r.content===NETLIFY;
const isNew=r.type==='A'&&r.content===FRACTA2;
if(!isOld&&!isNew)throw Error('record_drift_detected');
if(action==='audit'){
 console.log(JSON.stringify({schema:'fractafunction.jhn.dns.v1',state:isOld?'netlify':'fracta2',record_type:r.type,content:r.content,proxied:r.proxied,ttl:r.ttl,zone:ZONE}));
}else if(action==='apply'){
 if(isOld){
  await cf(`/zones/${zone}/dns_records/${r.id}`,'PUT',{type:'A',name:DOMAIN,content:FRACTA2,ttl:300,proxied:false});
 }
 console.log(JSON.stringify({schema:'fractafunction.jhn.dns.v1',action:'apply',state:'fracta2',changed:isOld}));
}else{
 if(isNew){
  await cf(`/zones/${zone}/dns_records/${r.id}`,'PUT',{type:'CNAME',name:DOMAIN,content:NETLIFY,ttl:10800,proxied:false});
 }
 console.log(JSON.stringify({schema:'fractafunction.jhn.dns.v1',action:'rollback',state:'netlify',changed:isNew}));
}
