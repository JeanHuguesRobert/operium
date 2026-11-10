import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,chmodSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {readJhnBootstrap,buildJhnDenoCommand} from './bootstrap-jhn-deno.js';
test('reads exactly the existing JHN bootstrap trio, passes no unrelated secrets',()=>{
 const d=mkdtempSync(join(tmpdir(),'ff-bootstrap-'));const f=join(d,'bootstrap.env');
 try{
  writeFileSync(f,'SUPABASE_URL=https://example.supabase.co/\nSUPABASE_SERVICE_ROLE_KEY=test-service-secret\nSUPABASE_ANON_KEY=test-anon\nOPENAI_API_KEY=should-not-leak\n');chmodSync(f,0o600);
  const b=readJhnBootstrap(f);const command=buildJhnDenoCommand({bootstrap:b,probe:true});
  assert.equal(b.urlHost,'example.supabase.co');
  assert.equal(command.env.SUPABASE_ANON_KEY,'test-anon');
  assert.equal(Object.hasOwn(command.env,'OPENAI_API_KEY'),false);
  assert.equal(command.args.at(-1).endsWith('probe-jhn-vault.ts'),true);
  assert.equal(command.args.some(a=>a.includes('test-service-secret')),false);
  chmodSync(f,0o644);assert.throws(()=>readJhnBootstrap(f),/permissions_too_open/);
 }finally{rmSync(d,{recursive:true,force:true})}
});
