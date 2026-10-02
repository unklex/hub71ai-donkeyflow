import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spendDatabase} from './spend-db.ts';
import {reserveSpend,recordActual} from '../worker/spend.ts';
test('atomic parallel reservations cannot overspend and actual costs replace estimates',async()=>{
 const env={DB:spendDatabase(),SPEND_LIMIT_USD:'1'};const results=await Promise.allSettled([reserveSpend(env,'plan','model',.5),reserveSpend(env,'plan','model',.5),reserveSpend(env,'plan','model',.5)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,2);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 await recordActual(env,1,.2);assert.ok(await reserveSpend(env,'detect','model',.3));await assert.rejects(reserveSpend(env,'plan','model',.01),e=>e instanceof Error&&'status' in e&&e.status===429);await assert.rejects(reserveSpend({},'plan','model',.5));
});
