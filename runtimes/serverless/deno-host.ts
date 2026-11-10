/**
 * Loopback Deno host for an explicit function manifest.
 * Server-side code owns the route map; incoming requests cannot choose files.
 * Run with a fixed --allow-net=127.0.0.1:<port> and only required permissions.
 */
import {invokeDenoEdge, type EdgeFn} from './deno-adapter.ts';
import {defineFunctionRoutes,routeMatches} from './contract.js';
export type Route={path:string;handler:EdgeFn};
export function createDenoServerlessHandler({routes,origin}:{routes:Route[];origin:string}){
 if(!origin.startsWith('https://'))throw Error('https_origin_required');
 const lookup=defineFunctionRoutes(routes);
 return async(request:Request)=>{
  try{
   const fn=lookup.find(r=>routeMatches(r.path,new URL(request.url).pathname))?.handler;
   if(!fn)return Response.json({ok:false,error:'route_not_registered'},{status:404});
   // Use the canonical external origin for environment-independent client code.
   const url=new URL(request.url);url.protocol='https:';url.hostname=new URL(origin).hostname;url.port=new URL(origin).port;
   const mirrored=new Request(url,request);
   const result=await invokeDenoEdge(fn,mirrored,{});
   return result;
  }catch{return Response.json({ok:false,error:'handler_execution_failed'},{status:502});}
 };
}
export function serveDenoServerless({routes,origin,port=8797,hostname='127.0.0.1'}:{routes:Route[];origin:string;port?:number;hostname?:string}){
 if(hostname!=='127.0.0.1'&&hostname!=='::1')throw Error('loopback_only');
 return Deno.serve({hostname,port},createDenoServerlessHandler({routes,origin}));
}
