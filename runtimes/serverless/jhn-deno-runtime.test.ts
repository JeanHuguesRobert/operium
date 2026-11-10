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
