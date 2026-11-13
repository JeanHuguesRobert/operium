/** Direct same-host relay to the canonical JHN COP consent service.
 * No new trust decision, issuer, mandate, grant, token logging or HTTP route.
 * The canonical service verifies Supabase session, exact origin and payload.
 */
import {request as nodeRequest} from 'node:http';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGIN='https://jhn.baronsmariani.org';
const json=(status,error)=>Response.json({ok:false,error,grants_mandate_authority:false},{status,headers:{'cache-control':'no-store'}});
/** Native HTTP preserves the canonical Host exactly; fetch implementations
 * may rewrite Host on loopback and make every real token look like a 404. */
export function canonicalHttpFetch(target,{method,headers,body,signal}={}){
 return new Promise((resolve,reject)=>{
  const u=new URL(target);
  if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.port!=='8796')return reject(Error('canonical_upstream_not_allowed'));
  const req=nodeRequest({hostname:'127.0.0.1',port:8796,path:u.pathname,method,headers,signal,timeout:8000},res=>{
   const chunks=[];let length=0;
   res.on('data',part=>{length+=part.length;if(length>16384){req.destroy(Error('canonical_reply_too_large'));return;}chunks.push(part)});
   res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
  });
  req.once('error',reject);req.once('timeout',()=>req.destroy(Error('upstream_timeout')));
  req.end(body);
 });
}
export function createLocalConsentProxy({fetchImpl=canonicalHttpFetch,upstream='http://127.0.0.1:8796'}={}){
 return async function canonicalConsentProxy(request){
  const url=new URL(request.url);
  const m=url.pathname.match(/^\/api\/cop\/principal-consent\/([a-f0-9-]{36})$/i);
  const continuationRequest=url.pathname==='/api/cop/principal-consent/continuation-request';
  if(url.origin!==ORIGIN||(!continuationRequest&&(!m||!UUID.test(m[1])))||url.search)
    return json(404,'consent_route_not_found');
  if(continuationRequest&&request.method!=='POST')return json(405,'method_not_allowed');
  if(!['GET','POST'].includes(request.method))return json(405,'method_not_allowed');
  if(request.method==='POST'&&request.headers.get('origin')!==ORIGIN)return json(403,'foreign_origin_denied');
  const bearer=request.headers.get('authorization');
  if(!bearer||!/^Bearer\s+[^\s]{10,8192}$/i.test(bearer))return json(401,'supabase_session_required');
  let body;
  if(request.method==='POST'){
   body=await request.text();if(body.length>2048)return json(413,'consent_body_too_large');
  }
  try{
   const response=await fetchImpl(upstream+url.pathname,{method:request.method,headers:{host:new URL(ORIGIN).host,
     authorization:bearer,accept:'application/json',...(request.method==='POST'?{origin:ORIGIN,'content-type':'application/json'}:{})},
     ...(request.method==='POST'?{body}:{}),redirect:'manual',signal:AbortSignal.timeout(8000)});
   if(!response.headers.get('content-type')?.toLowerCase().includes('application/json')||response.status>=500)
      return json(503,'canonical_consent_issuer_unavailable');
   const result=await response.text();if(result.length>16384)return json(502,'issuer_response_too_large');
   const parsed=JSON.parse(result);
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return json(502,'issuer_response_invalid');
   return new Response(JSON.stringify(parsed),{status:response.status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
  }catch{return json(503,'canonical_consent_issuer_unavailable');}
 };
}
