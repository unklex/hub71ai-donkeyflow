import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {createWorker} from '../worker/index.ts';
import type {D1Database} from '../worker/plan.ts';
import {checkPlan,excludedRoom,type Plan,type Room} from '../shared/plan.ts';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
const room:Room={id:'living',type:'living',name:'Living',floor:0,width_m:3.125,length_m:3,x_m:0,y_m:0,confidence:.9,furnish:true};
const plan:Plan={property_kind:'apartment',floors:1,bedrooms:0,dims_source:'printed',total_area_sqm:null,rooms:[room,{...room,id:'wc',type:'wc',name:'WC',width_m:null,length_m:null,x_m:null,y_m:null}]};
function database(){const rows=new Map<string,string>();const db:D1Database={prepare:()=>({bind:(...values:unknown[])=>({first:async<T>()=>(rows.has(String(values[0]))?{result_json:rows.get(String(values[0]))}:null) as T|null,run:async()=>{rows.set(String(values[0]),String(values[3]));return {success:true}}})})};return {db,rows}}
function request(files:Blob[]=[new Blob([png],{type:'image/png'})],furniture?:unknown){const form=new FormData();files.forEach((f,i)=>form.append(`floor_${i}`,f,`floor-${i}`));if(furniture)form.append('furniture',JSON.stringify(furniture));return new Request('https://example.test/api/plan',{method:'POST',body:form})}
const response=(value:unknown)=>Response.json({status:'completed',model:'gpt-6-astra-test',output:[{content:[{type:'output_text',text:JSON.stringify(value&&typeof value==='object'&&'labels' in value?{total_area_sqm:null,...value}:value)}]}]});
test('two strict high-detail passes preserve sizes, exclude WC, cache by image hash, and recalculate furniture checks',async t=>{
 const {db,rows}=database(),calls:Record<string,any>[]=[];
 t.mock.method(globalThis,'fetch',async (_url:unknown,init:RequestInit)=>{calls.push(JSON.parse(String(init.body)));return response(calls.length===1?{labels:[{text:'3.125 × 3.000 m',room_hint:'Living',floor:0,width_m:3.125,length_m:3}]}:structuredClone(plan))});
 const worker=createWorker(),env={DB:db,OPENAI_API_KEY:'secret'};
 const result=await worker.fetch(request(),env);assert.equal(result.status,200);const body=await result.json();assert.equal(body.rooms[0].width_m,3.125);assert.equal(body.rooms[1].furnish,false);assert.equal(body.rooms[1].width_m,null);assert.equal(body.model,'gpt-6-astra-test');assert.match(body.image_hash,/^[0-9a-f]{64}$/);assert.equal(body.warnings[0].message,'check size');assert.equal(rows.size,1);
 assert.equal(calls.length,2);for(const call of calls){assert.equal(call.model,'gpt-6-astra');assert.equal(call.text.format.strict,true);assert.equal(call.text.format.schema.additionalProperties,false);assert.equal(call.input[0].content[1].text.includes('Floor 0'),true);assert.equal(call.input[0].content[2].detail,'high')}
 assert.match(calls[0].input[0].content[0].text,/transcribe EVERY/);assert.match(calls[1].input[0].content[0].text,/3.125 × 3.000 m/);
 const cached=await (await worker.fetch(request(undefined,[{room_id:'living',width_m:4,length_m:4}]),env)).json();assert.equal(cached.cached,true);assert.equal(calls.length,2);assert.equal(cached.warnings.length,2);
});
test('two floors stay separate and identical coordinates on different floors do not overlap',async t=>{
 const {db}=database();let calls=0;
 t.mock.method(globalThis,'fetch',async (_url:unknown,init:RequestInit)=>{const body=JSON.parse(String(init.body));assert.equal(body.input[0].content.filter((c:any)=>c.type==='input_image').length,2);return response(++calls===1?{labels:[0,1].map(floor=>({text:'3.125 × 3 m',room_hint:'Living',floor,width_m:3.125,length_m:3}))}:{...plan,floors:2,rooms:[room,{...room,id:'upper',floor:1}]})});
 const body=await (await createWorker().fetch(request([new Blob([png]),new Blob([png])]),{DB:db,OPENAI_API_KEY:'secret'})).json();assert.equal(body.floors,2);assert.equal(body.rooms[1].floor,1);assert.equal(body.warnings.some((w:any)=>w.message==='check layout'),false);
});
test('direct PDF input sends only its first page',async t=>{
 const pdf=await PDFDocument.create();pdf.addPage();pdf.addPage();const {db}=database();let calls=0;
 t.mock.method(globalThis,'fetch',async (_url:unknown,init:RequestInit)=>{const body=JSON.parse(String(init.body));const file=body.input[0].content.find((c:any)=>c.type==='input_file');const sent=await PDFDocument.load(Buffer.from(file.file_data.split(',')[1],'base64'));assert.equal(sent.getPageCount(),1);return response(++calls===1?{labels:[]}:{...plan,rooms:[{...room,width_m:null,length_m:null}]})});
 const result=await createWorker().fetch(request([new Blob([new Uint8Array(await pdf.save())],{type:'application/pdf'})]),{DB:db,OPENAI_API_KEY:'secret'});assert.equal(result.status,200);
});
test('hallucinated sizes become null and overlapping placements are removed without changing printed sizes',async t=>{
 const {db}=database();let calls=0;
 t.mock.method(globalThis,'fetch',async ()=>response(++calls===1?{labels:[{text:'3.125 × 3 m',room_hint:null,floor:0,width_m:3.125,length_m:3}]}:{...plan,rooms:[room,{...room,id:'overlap',width_m:3.125},{...room,id:'invented',width_m:8,length_m:9,x_m:10}] }));
 const body=await (await createWorker().fetch(request(),{DB:db,OPENAI_API_KEY:'secret'})).json();assert.equal(body.rooms[0].width_m,3.125);assert.equal(body.rooms[0].x_m,null);assert.equal(body.rooms[2].width_m,null);assert.equal(body.rooms[2].length_m,null);assert.ok(body.warnings.some((w:any)=>w.message==='check layout'));
});
test('bad files, missing floors, oversized bodies and missing configuration have explicit errors',async()=>{
 const worker=createWorker();assert.equal((await worker.fetch(request([new Blob(['bad'])]))).status,422);assert.equal((await worker.fetch(request())).status,503);
 const f=new FormData();f.append('floor_1',new Blob([png]),'upper.png');assert.equal((await worker.fetch(new Request('https://example.test/api/plan',{method:'POST',body:f}))).status,422);
 assert.equal((await worker.fetch(new Request('https://example.test/api/plan',{method:'POST',headers:{'Content-Length':String(25*1024*1024)},body:'x'}))).status,413);
 const {db}=database();assert.equal((await worker.fetch(request(),{DB:db})).status,503);
});
test('upstream failures and refusals are not cached',async t=>{
 const {db,rows}=database();t.mock.method(globalThis,'fetch',async()=>Response.json({error:'secret'},{status:429}));const result=await createWorker().fetch(request(),{DB:db,OPENAI_API_KEY:'secret'});assert.equal(result.status,502);assert.equal(rows.size,0);assert.equal((await result.text()).includes('secret'),false);
});
test('model refusals and incomplete responses are rejected without saving a result',async t=>{
 const {db,rows}=database();const mock=t.mock.method(globalThis,'fetch',async()=>Response.json({status:'completed',output:[{content:[{type:'refusal',refusal:'Cannot analyse'}]}]}));
 const worker=createWorker(),env={DB:db,OPENAI_API_KEY:'secret'};assert.equal((await worker.fetch(request(),env)).status,502);
 mock.mock.mockImplementation(async()=>Response.json({status:'incomplete',output:[]}));assert.equal((await worker.fetch(request(),env)).status,502);assert.equal(rows.size,0);
});
test('furniture can rotate and all excluded service types default to false',()=>{
 assert.equal(checkPlan({...plan,rooms:[{...room,type:'study',name:'Study',width_m:2,length_m:3}]},[{room_id:'living',width_m:3,length_m:2}]).length,0);
 for(const type of ['bathroom','WC','laundry','corridor','stairs','balcony','parking','garden','pool','walk_in_closet','water_tank'])assert.equal(excludedRoom({type,name:type}),true,type);
});
