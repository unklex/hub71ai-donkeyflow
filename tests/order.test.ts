import {test} from 'node:test';
import assert from 'node:assert/strict';
import {orderTotals,requestHtml,type RequestDraft} from '../shared/order.ts';
test('quote includes every pickup, selected assembly and one truck',()=>{
 assert.deepEqual(orderTotals([1000,500,250],2,2),{furniture:1750,delivery:350,assembly:180,total:2280,trucks:1});
 assert.equal(orderTotals([100],1,0).total,400);
 assert.throws(()=>orderTotals([100],0,0));assert.throws(()=>orderTotals([100],1,2));assert.throws(()=>orderTotals([100],1.5,0));
});
const draft:RequestDraft={property:'tower',resident:'<script>alert(1)</script>',phone:'0501234567',building:'Tower & Home',unit:'101',date:'2026-10-10',start:'09:00',end:'12:00',mover:'Test',vehicle:'',notes:'Use loading bay'};
test('printable draft chooses lift or gate request and safely preserves editable fields',()=>{
 const tower=requestHtml(draft,2,1);assert.match(tower,/Service-lift booking request/);assert.match(tower,/contenteditable="true"/);assert.match(tower,/@media print/);assert.match(tower,/One truck · 2 pickup points · 1 item for assembly/);assert.doesNotMatch(tower,/<script>/);assert.match(tower,/&lt;script&gt;/);
 for(const property of ['villa','townhouse'] as const){const html=requestHtml({...draft,property},1,0);assert.match(html,/Community gate permit request/);assert.doesNotMatch(html,/reserve the service lift/)}
});
