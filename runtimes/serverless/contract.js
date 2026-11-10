/** Portable FractaFunction contract.
 * Business handlers receive standard Web Request and return Web Response.
 * Providers (Fracta2, Netlify, Cloudflare, Supabase) are transport adapters;
 * neither provider credentials nor implicit Principal authority are supplied.
 */
export const FRACTA_FUNCTION_CONTRACT='operium.fracta-function.web.v1';
export function defineFractaFunction(handler){
 if(typeof handler!=='function')throw new TypeError('function_handler_required');
 return async (request,context={})=>{
   if(!(request instanceof Request))throw new TypeError('web_request_required');
   const response=await handler(request,context);
   if(!(response instanceof Response))throw new TypeError('web_response_required');
   return response;
 };
}
export function defineFunctionRoutes(routes){
 if(!Array.isArray(routes))throw new TypeError('routes_array_required');
 const registered=new Set();
 return Object.freeze(routes.map(r=>{
   if(!r||typeof r.path!=='string'||!r.path.startsWith('/')||(!/^\/[A-Za-z0-9_./*-]+$/.test(r.path))||
      (r.path.includes('*')&&!r.path.endsWith('/*'))||
      registered.has(r.path)||typeof r.handler!=='function')throw new TypeError('invalid_route_manifest');
   registered.add(r.path);
   return Object.freeze({path:r.path,handler:defineFractaFunction(r.handler)});
 }));
}

/** Explicit exact and terminal-prefix matches only. No user-supplied regex. */
export function routeMatches(routePath,pathname){
 if(typeof pathname!=='string'||!pathname.startsWith('/'))return false;
 if(routePath.endsWith('/*')){
  const prefix=routePath.slice(0,-1);
  return pathname.startsWith(prefix)&&pathname.length>prefix.length;
 }
 return routePath===pathname;
}
