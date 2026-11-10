import {assertEquals, assertThrows} from 'jsr:@std/assert@1.0.14';
import {createDenoServerlessHandler,serveDenoServerless} from './deno-host.ts';
Deno.test('Deno edge route selection and browser-facing origin',async()=>{
 const handle=createDenoServerlessHandler({origin:'https://jhn.baronsmariani.org',routes:[{path:'/edge',handler:async r=>Response.json({url:r.url,method:r.method},{status:207})}]});
 const ok=await handle(new Request('http://127.0.0.1:8797/edge',{method:'POST',body:'hello'}));
 assertEquals(ok.status,207);assertEquals((await ok.json()).url,'https://jhn.baronsmariani.org/edge');
 assertEquals((await handle(new Request('http://127.0.0.1:8797/unknown'))).status,404);
 assertThrows(()=>serveDenoServerless({origin:'https://example.org',hostname:'0.0.0.0',routes:[]}),Error,'loopback_only');
});
