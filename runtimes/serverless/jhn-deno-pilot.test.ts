import {assertEquals} from 'jsr:@std/assert@1.0.14';
import {jhnDenoHandler} from './jhn-deno-pilot.ts';
const base='http://127.0.0.1:8797';
const uuid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
Deno.test('Real existing JHN Edge function: anonymous rejected before network forwarding',async()=>{
 const response=await jhnDenoHandler(new Request(`${base}/api/cop/principal-consent/${uuid}`));
 assertEquals(response.status,401);
 assertEquals((await response.json()).error,'supabase_session_required');
 assertEquals((await jhnDenoHandler(new Request(`${base}/api/cop/principal-consent/invalid`))).status,404);
 assertEquals((await jhnDenoHandler(new Request(`${base}/no-route`))).status,404);
});
