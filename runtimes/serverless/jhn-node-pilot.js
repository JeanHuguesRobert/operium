#!/usr/bin/env node
/** One explicit JHN legacy Node function on the FractaFunction local host.
 * Does not expose a public Caddy route or touch the COP journal.
 */
import {createServerlessHost} from './host.js';
import {invokeNodeFunction} from './node-adapter.js';
import {handler as ccPetitionPdf} from '../../../inseme/apps/platform/netlify/profiles/jhn/functions/cc-petition-pdf.js';
const path='/cc/requete-conseil-constitutionnel-haute-corse-2026.pdf';
export function createJhnNodePilot({port=8799}={}){
 return createServerlessHost({host:'127.0.0.1',port,publicOrigin:'https://jhn.baronsmariani.org',routes:[
   {match:p=>p===path,invoke:request=>invokeNodeFunction(ccPetitionPdf,request)}
 ]});
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const instance=createJhnNodePilot({port:Number(process.env.FRACTAFUNCTION_PILOT_PORT||8799)});
 const binding=await instance.listen();
 console.log(JSON.stringify({event:'fractafunction.node.pilot.started',host:binding.address,port:binding.port,path,public:false}));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{instance.close().finally(()=>process.exit(0))});
}
