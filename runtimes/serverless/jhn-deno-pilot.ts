/** A real existing JHN Deno Edge Function through the FractaFunction host.
 * Only internal loopback; no Caddy registration or COP decision mutation.
 */
import principalConsentProxy from '../../../inseme/apps/platform/netlify/edge-functions/principal-consent-proxy.js';
import {createDenoServerlessHandler,serveDenoServerless} from './deno-host.ts';
const origin='https://jhn.baronsmariani.org';
const routes=[{path:'/api/cop/principal-consent/*',handler:principalConsentProxy}];
export const jhnDenoHandler=createDenoServerlessHandler({origin,routes});
if(import.meta.main){
 const port=Number(Deno.env.get('FRACTAFUNCTION_DENO_PILOT_PORT')||8797);
 serveDenoServerless({routes,origin,port});
}
