/** Loopback-only FractaFunction Node -> Deno gateway for an explicit route. */
import {request as nodeRequest} from 'node:http';
export function createDenoLoopback({port=8797}={}){
 return async request=>{
  const path=new URL(request.url);
  if(path.origin!=='https://jhn.baronsmariani.org')return Response.json({error:'wrong_origin'},{status:403});
  const content=Buffer.from(await request.arrayBuffer());
  if(content.length>1048576)return Response.json({error:'request_too_large'},{status:413});
  return new Promise(resolve=>{
   const headers={host:'127.0.0.1:'+port};
   for(const k of ['authorization','content-type','accept','origin']){
    const value=request.headers.get(k);if(value)headers[k]=value;
   }
   const req=nodeRequest({host:'127.0.0.1',port,method:request.method,path:path.pathname+path.search,headers,timeout:7000},res=>{
     let total=0;const chunks=[];
     res.on('data',part=>{total+=part.length;if(total>1048576)return req.destroy(Error('response_too_large'));chunks.push(part)});
     res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:{
       'content-type':res.headers['content-type']||'application/json','cache-control':'no-store'
     }})));
   });
   req.on('error',()=>resolve(Response.json({ok:false,error:'deno_runtime_unavailable'},{status:503})));
   req.on('timeout',()=>req.destroy(Error('deno_timeout')));
   req.end(content.length?content:undefined);
  });
 };
}
