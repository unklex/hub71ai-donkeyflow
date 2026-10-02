import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spendDatabase} from './spend-db.ts';
import {reserveSpend,recordActual} from '../worker/spend.ts';
import {createWorker,type Env} from '../worker/index.ts';
const budgetMessage='Demo AI budget reached. Showing saved results only.',trackingMessage='AI spend tracking is unavailable. Check database migrations.';
test('atomic parallel reservations cannot overspend and actual costs replace estimates',async()=>{
 const env={DB:spendDatabase(),SPEND_LIMIT_USD:'1'};const results=await Promise.allSettled([reserveSpend(env,'plan','model',.5),reserveSpend(env,'plan','model',.5),reserveSpend(env,'plan','model',.5)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,2);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 await recordActual(env,1,.2);assert.ok(await reserveSpend(env,'detect','model',.3));await assert.rejects(reserveSpend(env,'plan','model',.01),e=>e instanceof Error&&'status' in e&&e.status===429);await assert.rejects(reserveSpend({},'plan','model',.5));
});
test('over the limit reports the budget message and missing DB reports unavailable',async()=>{
 await assert.rejects(reserveSpend({DB:spendDatabase(),SPEND_LIMIT_USD:'0'},'plan','model',.5),{status:429,message:budgetMessage});await assert.rejects(reserveSpend({},'plan','model',.5),{status:503,message:trackingMessage});
});
test('prepare and first failures report unavailable without calling OpenAI',async t=>{
 const error=new Error('no such table: api_spend'),log=t.mock.method(console,'error',()=>{}),mock=t.mock.method(globalThis,'fetch',async()=>{throw new Error('Fetch must not run')});
 for(const stage of ['prepare','first']){const DB:Env['DB']={prepare:()=>{if(stage==='prepare')throw error;return {bind:()=>({first:async()=>{throw error},run:async()=>{}})}}};await assert.rejects(reserveSpend({DB},'plan','model',.5),{status:503,message:trackingMessage});const response=await createWorker().fetch(new Request('https://test/api/sell/detect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({frames:[{seen_at_s:0,image_url:'data:image/jpeg;base64,/9j/'}]})}),{DB,OPENAI_API_KEY:'test'});assert.equal(response.status,503);assert.equal((await response.json()).detail,trackingMessage)}
 assert.equal(mock.mock.callCount(),0);assert.equal(log.mock.callCount(),4);for(const call of log.mock.calls)assert.deepEqual(call.arguments,['spend accounting failed',error]);
});
test('health reports unavailable when the spend table query throws',async()=>{
 const DB:Env['DB']={prepare:()=>({bind:()=>({first:async()=>{throw new Error('no such table: api_spend')},run:async()=>{}})})};const response=await createWorker().fetch(new Request('https://test/api/health'),{DB});assert.equal(response.status,200);const health=await response.json();assert.equal(health.spend_tracking,'unavailable');assert.equal(health.spent_usd,null);
});
test('health reports available spend and unavailable without DB',async()=>{
 const worker=createWorker();const health=await (await worker.fetch(new Request('https://test/api/health'),{DB:spendDatabase()})).json();assert.equal(health.spend_tracking,'ok');assert.equal(health.spent_usd,0);assert.equal((await (await worker.fetch(new Request('https://test/api/health'))).json()).spend_tracking,'unavailable');
});
