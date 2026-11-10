/** Guard for the original JHN COP append-only Edge handler.
 * Never accepts writes unless an operator explicitly sets the local toggle;
 * feature readiness is not a mandate or an authorization to send events.
 */
import jhnCopEvents from '../../../inseme/apps/platform/netlify/edge-functions/jhn-cop-events.js';
const refused=(status:number,error:string)=>Response.json({ok:false,error},{status,headers:{'cache-control':'no-store'}});
export async function guardedCopEvents(request:Request):Promise<Response>{
 if(request.method!=='POST')return refused(405,'method_not_allowed');
 // The feature must be deliberately enabled after validation of the
 // authenticated origin, capability, Supabase schema, and append receipt.
 let enabled=false;
 try{enabled=Deno.env.get('FRACTAFUNCTION_COP_EVENT_WRITES')==='enabled';}catch{enabled=false;}
 if(!enabled)
   return refused(503,'cop_event_ingress_not_activated');
 // Original handler still independently validates Vault capability and input.
 return jhnCopEvents(request);
}
