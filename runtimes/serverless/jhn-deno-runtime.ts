/** Deno worker for the JHN FractaFunction manifest; no provider keys injected. */
import corsicaContext from '../../../inseme/packages/brique-oleole/src/edge/corsica-context-api.js';
import principalConsentProxy from '../../../inseme/apps/platform/netlify/edge-functions/principal-consent-proxy.js';
import jhnChatStream from '../../../inseme/packages/brique-ophelia/edge/jhn-chat-stream.js';
import {createDenoServerlessHandler,serveDenoServerless} from './deno-host.ts';
const origin='https://jhn.baronsmariani.org';
// principal-consent-proxy retained only for compatibility testing; NOT
// forwarded from the public JHN facade, which targets canonical COP directly.
export const routes=[
 {path:'/api/corsica/context',handler:corsicaContext},
 {path:'/api/chat-stream',handler:async(request:Request)=>{
   // Healthcheck uses the existing function. Runtime secrets are deliberately
   // absent; POST remains unavailable until COP event and vault parity.
   if(request.method==='GET'&&new URL(request.url).searchParams.get('healthcheck')==='true')
      return jhnChatStream(request);
   return Response.json({ok:false,error:'jhn_chat_runtime_not_configured'},{status:503});
 }},
 {path:'/api/cop/principal-consent/*',handler:principalConsentProxy},
];
export const handler=createDenoServerlessHandler({origin,routes});
if(import.meta.main){
 const port=Number(Deno.env.get('FRACTAFUNCTION_DENO_PORT')||8797);
 serveDenoServerless({routes,origin,port});
}
