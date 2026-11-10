import {assertEquals} from 'jsr:@std/assert@1.0.14';
import {invokeDenoEdge} from './deno-adapter.ts';
Deno.test('native edge handler preserves status/headers/body',async()=>{
 const response=await invokeDenoEdge(async r=>Response.json({method:r.method},{status:202,headers:{'x-edge':'yes'}}),new Request('https://example.test/api/hello'));
 assertEquals(response.status,202);assertEquals(response.headers.get('x-edge'),'yes');assertEquals((await response.json()).method,'GET');
});
