/** Server-side port-normalized Request/Response route gateway. */
import {createServer} from 'node:http';
import {defineFractaFunction} from './contract.js';
const MAX_BODY=1024*1024;
export function createServerlessHost({routes,port=0,host='127.0.0.1',publicOrigin='https://jhn.baronsmariani.org'}={}){
 if(host!=='127.0.0.1'&&host!=='::1')throw Error('serverless_host_must_be_loopback');
 if(!Array.isArray(routes)||routes.some(x=>!x||typeof x.match!=='function'||typeof x.invoke!=='function'))throw Error('explicit_routes_required');
 const normalizedRoutes=routes.map(r=>({...r,invoke:defineFractaFunction(r.invoke)}));
 const srv=createServer(async(req,res)=>{
   const respond=(status,text)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:false,error:text}));};
   try{
     const path=req.url||'/';
     const url=new URL(path,publicOrigin);
     const route=normalizedRoutes.find(x=>x.match(url.pathname));
     if(!route)return respond(404,'route_not_registered');
     let len=0;const chunks=[];
     for await(const chunk of req){len+=chunk.length;if(len>MAX_BODY)return respond(413,'request_too_large');chunks.push(chunk);}
     const headers=new Headers();
     for(const [key,value] of Object.entries(req.headers))if(typeof value==='string'&&!['host','connection','transfer-encoding','content-length'].includes(key))headers.set(key,value);
     const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
     const response=await route.invoke(request);
     if(!(response instanceof Response))return respond(502,'invalid_handler_response');
     const resultHeaders={};for(const [key,value]of response.headers)if(!['content-length','transfer-encoding','connection'].includes(key))resultHeaders[key]=value;
     res.writeHead(response.status,resultHeaders);
     res.end(Buffer.from(await response.arrayBuffer()));
   }catch{return respond(502,'handler_execution_failed');}
 });
 return {listen:()=>new Promise((resolve,reject)=>{srv.once('error',reject);srv.listen(port,host,()=>resolve(srv.address()));}),close:()=>new Promise(resolve=>srv.close(resolve)),server:srv};
}
