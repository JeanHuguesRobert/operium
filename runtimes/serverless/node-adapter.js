/**
 * A deliberately bounded Netlify-compatible Node Function adapter.
 * It translates Node Request into Netlify's legacy handler(event, context)
 * and translates {statusCode,headers,body,isBase64Encoded} back to Response.
 * Does not issue mandates or impersonate Netlify identity / AWS Lambda.
 */
const MAX_BODY=1024*1024;
const HEADER_ALLOWED=/^[\x21-\x7e]+$/;
const restrictedHeaders=new Set(['connection','transfer-encoding','content-length','set-cookie']);
export function nodeFunctionEvent(request,{clientAddress='127.0.0.1'}={}){
  const url=new URL(request.url);
  const headers=Object.fromEntries(request.headers.entries());
  return {httpMethod:request.method,path:url.pathname,rawUrl:url.href,
    rawQuery:url.search.slice(1),queryStringParameters:Object.fromEntries(url.searchParams),
    multiValueQueryStringParameters:Object.fromEntries([...new Set(url.searchParams.keys())].map(k=>[k,url.searchParams.getAll(k)])),
    headers,clientContext:{},requestContext:{http:{method:request.method,sourceIp:clientAddress}},
    isBase64Encoded:false};
}
export async function invokeNodeFunction(handler,request,{maxBody=MAX_BODY,clientAddress}={}){
  if(typeof handler!=='function')throw Error('node_handler_required');
  const event=nodeFunctionEvent(request,{clientAddress});
  const bytes=new Uint8Array(await request.arrayBuffer());
  if(bytes.byteLength>maxBody)return new Response('Body too large',{status:413});
  event.body=bytes.byteLength?Buffer.from(bytes).toString('utf8'):null;
  const result=await handler(event,{});
  if(!result||typeof result!=='object'||!Number.isInteger(result.statusCode)||result.statusCode<100||result.statusCode>599)
    throw Error('node_function_invalid_result');
  const headers=new Headers();
  for(const [key,value] of Object.entries(result.headers||{})){
    if(restrictedHeaders.has(key.toLowerCase())||!HEADER_ALLOWED.test(key))continue;
    if(typeof value==='string'||typeof value==='number')headers.set(key,String(value));
  }
  const body=result.isBase64Encoded?Buffer.from(result.body||'','base64'):String(result.body??'');
  return new Response(body,{status:result.statusCode,headers});
}
