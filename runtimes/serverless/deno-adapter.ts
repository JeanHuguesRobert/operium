/**
 * Native Deno Edge Function adapter: default export (request, context) -> Response.
 * Does not imitate Netlify Context.site/geo, Deno Deploy permissions, or cookies.
 * Modules are statically configured on the server, NEVER chosen from HTTP.
 */
export type EdgeFn=(request:Request,context:Record<string,unknown>)=>Response|Promise<Response>;
export async function invokeDenoEdge(fn:EdgeFn,request:Request,context:Record<string,unknown>={}):Promise<Response>{
 if(typeof fn!=='function')throw Error('deno_handler_required');
 const result=await fn(request,context);
 if(!(result instanceof Response))throw Error('deno_function_invalid_result');
 return result;
}
