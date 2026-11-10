import {assertEquals} from 'jsr:@std/assert@1.0.14';
import {handler} from './jhn-deno-runtime.ts';
Deno.test('actual Corsica context edge function rejects missing coordinates without outbound IO',async()=>{
 const response=await handler(new Request('http://127.0.0.1:8797/api/corsica/context'));
 assertEquals(response.status,400);
 assertEquals((await response.json()).error,'corsica_location_required');
});
Deno.test('chat healthcheck uses original Deno handler, POST fails closed',async()=>{
 const check=await handler(new Request('http://127.0.0.1:8797/api/chat-stream?healthcheck=true'));
 assertEquals(check.status,200);
 assertEquals((await check.json()).orchestration,'cop');
 const post=await handler(new Request('http://127.0.0.1:8797/api/chat-stream',{method:'POST',body:'{}'}));
 assertEquals(post.status,503);
 assertEquals((await post.json()).error,'jhn_chat_runtime_not_configured');
});
Deno.test('NASA and interactions source functions: read-only and no bearer fail closed',async()=>{
 for(const path of ['/api/nasa/control','/api/interactions/desk']){
   const anonymous=await handler(new Request('http://127.0.0.1:8797'+path));
   assertEquals(anonymous.status,401);
   assertEquals((await anonymous.json()).error,'missing_bearer_token');
   for(const method of ['POST','PATCH']){
     const refused=await handler(new Request('http://127.0.0.1:8797'+path,{method,body:'{}'}));
     assertEquals(refused.status,405);
   }
 }
});

Deno.test('COP append ingress remains explicitly disabled by default',async()=>{
 const get=await handler(new Request('http://127.0.0.1:8797/api/jhn-cop-events'));
 assertEquals(get.status,405);
 const post=await handler(new Request('http://127.0.0.1:8797/api/jhn-cop-events',{method:'POST',body:'{}'}));
 assertEquals(post.status,503);
 assertEquals((await post.json()).error,'cop_event_ingress_not_activated');
});
