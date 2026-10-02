import {spendDatabase} from './spend-db.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {readFileSync} from 'node:fs';
import plans from '../data/plans.json' with {type:'json'};
import planFallbacks from '../data/plan_fallbacks.json' with {type:'json'};
import {createWorker} from '../worker/index.ts';
import {fillSizes} from '../worker/plan.ts';
import {parseBundleInput,solveBundle} from '../worker/bundle.ts';
import catalog from '../data/catalog.json' with {type:'json'};
import type {CatalogRecord} from '../shared/catalog.ts';
import type {D1Database} from '../worker/plan.ts';
import {checkPlan,excludedRoom,defaultRoomSize,type Plan,type PlanResult,type Room} from '../shared/plan.ts';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
const room:Room={id:'living',type:'living',name:'Living',floor:0,width_m:3.125,length_m:3,x_m:0,y_m:0,confidence:.9,furnish:true};
const plan:Plan={property_kind:'apartment',floors:1,bedrooms:0,dims_source:'printed',total_area_sqm:null,rooms:[room,{...room,id:'wc',type:'wc',name:'WC',width_m:null,length_m:null,x_m:null,y_m:null}]};
function database(){const spend=spendDatabase();const rows=new Map<string,string>();const db:D1Database={prepare:(sql:string)=>sql.includes('api_spend')?spend.prepare(sql):({bind:(...values:unknown[])=>({first:async<T>()=>(rows.has(String(values[0]))?{result_json:rows.get(String(values[0]))}:null) as T|null,run:async()=>{rows.set(String(values[0]),String(values[3]));return {success:true}}})})};return {db,rows}}
function request(files:Blob[]=[new Blob([png],{type:'image/png'})],furniture?:unknown){const form=new FormData();files.forEach((f,i)=>form.append(`floor_${i}`,f,`floor-${i}`));if(furniture)form.append('furniture',JSON.stringify(furniture));return new Request('https://example.test/api/plan',{method:'POST',body:form})}
const response=(value:unknown)=>Response.json({status:'completed',model:'gpt-6-astra-test',output:[{content:[{type:'output_text',text:JSON.stringify(value&&typeof value==='object'&&'labels' in value?{total_area_sqm:null,...value}:value)}]}]});
const catalogueWorker=createWorker(Object.fromEntries(plans.flatMap(p=>p.images.map(img=>['/'+img.local_path,{type:'image/jpeg',base64:readFileSync(new URL('../frontend/public/'+img.local_path,import.meta.url)).toString('base64')}]))));
const catalogueRequest=(plan_id='6641')=>new Request('https://test/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan_id})});
test('catalogue plans fill all-null sizes at response time, including old cache entries',async t=>{
 const {db,rows}=database();let calls=0;const fallback=planFallbacks['6641'];const mock=t.mock.method(globalThis,'fetch',async()=>response(++calls===1?{labels:[{text:'Living',room_hint:'Dining and Living Area.',floor:0,width_m:null,length_m:null}]}:{...fallback,rooms:fallback.rooms.map(r=>({...r,width_m:null,length_m:null}))}));
 const env={DB:db,OPENAI_API_KEY:'test'},response1=await catalogueWorker.fetch(catalogueRequest(),env);assert.equal(response1.status,200);const result=await response1.json();assert.equal(result.dims_source,'estimated');assert.equal(result.rooms.find((r:Room)=>r.type==='living').width_m,7.5);assert.equal(result.rooms.find((r:Room)=>r.type==='master_bedroom').width_m,4.5);assert.equal(result.rooms.find((r:Room)=>r.name==='Bedroom').length_m,3.8);assert.equal(result.rooms.find((r:Room)=>r.type==='bathroom').width_m,null);
 assert.equal(result.warnings.filter((w:{reason:string})=>w.reason==='Typical size used: no printed dimensions. Confirm before buying.').length,5);const [cacheKey,raw]=[...rows.entries()][0];assert.match(cacheKey,/^v2:/);assert.ok(JSON.parse(raw).rooms.every((r:Room)=>r.width_m===null&&r.length_m===null));
 const cached=await (await catalogueWorker.fetch(catalogueRequest(),{...env,SPEND_LIMIT_USD:'0'})).json();assert.equal(cached.cached,true);assert.deepEqual(cached.rooms,result.rooms);assert.deepEqual(cached.warnings,result.warnings);assert.equal(mock.mock.callCount(),2);assert.equal(rows.get(cacheKey),raw);
});
test('catalogue failure, missing API key and cap return complete typical plans without caching',async t=>{
 const {db,rows}=database(),env={DB:db,OPENAI_API_KEY:'test'};const mock=t.mock.method(globalThis,'fetch',async()=>{throw new Error('timeout')});
 for(const options of [env,{DB:db},{...env,SPEND_LIMIT_USD:'0'}]){const response=await catalogueWorker.fetch(catalogueRequest(),options);assert.equal(response.status,200);const result=await response.json();assert.equal(result.model,'fallback');assert.equal(result.cached,false);assert.equal(result.dims_source,'estimated');assert.match(result.image_hash,/^[a-f0-9]{64}$/);assert.deepEqual(result.dimension_labels,[]);assert.deepEqual(result.rooms,planFallbacks['6641'].rooms);assert.ok(result.warnings.some((w:{reason:string})=>w.reason==='AI analysis unavailable. Showing typical sizes for this plan.'))}
 assert.equal(mock.mock.callCount(),1);assert.equal(rows.size,0);assert.equal((await createWorker().fetch(request(),env)).status,502);
 mock.mock.mockImplementation(async()=>Response.json({error:'unavailable'},{status:500}));assert.equal((await catalogueWorker.fetch(catalogueRequest(),env)).status,200);
 mock.mock.mockImplementation(async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:'not JSON'}]}]}));assert.equal((await catalogueWorker.fetch(catalogueRequest(),env)).status,200);
});
test('all five typical plans match catalogue floor/bedroom counts and support furniture bundles',async()=>{
 for(const entry of plans){const response=await catalogueWorker.fetch(catalogueRequest(entry.id),{DB:database().db});assert.equal(response.status,200);const result=await response.json() as PlanResult;assert.equal(result.floors,entry.images.length);assert.equal(result.bedrooms,entry.bedrooms);assert.equal(result.rooms.filter(r=>/bedroom/.test(r.type)).length,entry.bedrooms);assert.equal(new Set(result.rooms.map(r=>r.id)).size,result.rooms.length);assert.ok(result.rooms.every(r=>r.x_m===null&&r.y_m===null&&r.confidence===.5&&r.floor>=0&&r.floor<result.floors));assert.ok(result.rooms.filter(r=>!r.furnish).every(r=>r.width_m===null&&r.length_m===null));assert.equal(solveBundle(parseBundleInput({rooms:result.rooms,needed_categories:['sofa','bed'],budget_aed:3000}),catalog.items as CatalogRecord[]).items.length,2)}
});
test('generic uploaded-room defaults preserve known sizes and matching catalogue rooms use their floor',()=>{
 const cases:[string,[number,number]|null][]=[['master bedroom',[4.5,4]],['main bedroom',[4.5,4]],['bedroom',[4,3.5]],['studio',[6,4.5]],['dining',[4,3.5]],['office',[3,2.8]],['kitchen',[3.5,3]],['maid',[2.5,2.2]],['storage',null]];for(const [type,size] of cases)assert.deepEqual(defaultRoomSize({type,name:type}),size);
 const source:PlanResult={...plan,model:'test',image_hash:'test',cached:false,dimension_labels:[],warnings:[],rooms:[{...room,name:'DINING AND LIVING AREA.',type:'living_room',width_m:null,length_m:null},{...room,id:'bed',floor:1,type:'bedroom',name:'Bedroom',width_m:3.125,length_m:null},{...room,id:'study',type:'study',name:'Study',width_m:null,length_m:null},{...room,id:'wc',type:'wc',name:'WC',furnish:false,width_m:null,length_m:null}]};const filled=fillSizes(source,'6641');assert.deepEqual([filled.rooms[0].width_m,filled.rooms[0].length_m],[7.5,4.5]);assert.deepEqual([filled.rooms[1].width_m,filled.rooms[1].length_m],[3.125,3.8]);assert.deepEqual([filled.rooms[2].width_m,filled.rooms[2].length_m],[3,2.8]);assert.equal(filled.rooms[3].width_m,null);assert.equal(filled.dims_source,'estimated');assert.equal(source.rooms[0].width_m,null);assert.equal(source.warnings.length,0);
});
test('two plan calls exhaust USD 1; the third is refused without fetch, while cache hits work',async t=>{
 const {db}=database();let calls=0;const mock=t.mock.method(globalThis,'fetch',async()=>response(++calls===1?{labels:[]}:structuredClone(plan)));const worker=createWorker(),env={DB:db,OPENAI_API_KEY:'test',SPEND_LIMIT_USD:'1',COST_PLAN_CALL_USD:'.50'};
 assert.equal((await worker.fetch(request(),env)).status,200);assert.equal(calls,2);const cached=await worker.fetch(request(),env);assert.equal(cached.status,200);assert.equal((await cached.json()).cached,true);
 const refused=await worker.fetch(request(),{...env,PLAN_VISION_MODEL:'another-model'});assert.equal(refused.status,429);assert.equal((await refused.json()).detail,'Demo AI budget reached. Showing saved results only.');assert.equal(mock.mock.callCount(),2);
 const health=await (await worker.fetch(new Request('https://test/api/health'),env)).json();assert.equal(health.spent_usd,1);assert.equal(health.remaining_usd,0);
});
test('gpt-4 and explicit none omit reasoning; other models default to high',async t=>{
 for(const options of [{PLAN_VISION_MODEL:'gpt-4.1'},{PLAN_REASONING_EFFORT:'none'},{}]){const {db}=database();let calls=0;t.mock.method(globalThis,'fetch',async(_url:unknown,init:RequestInit)=>{const body=JSON.parse(String(init.body));assert.deepEqual(body.reasoning,Object.keys(options).length?undefined:{effort:'high'});return response(++calls===1?{labels:[]}:structuredClone(plan))});assert.equal((await createWorker().fetch(request(),{DB:db,OPENAI_API_KEY:'test',...options})).status,200)}
});
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
test('unsupported sizes stay null in cache and response defaults never change printed sizes',async t=>{
 const {db,rows}=database();let calls=0;
 t.mock.method(globalThis,'fetch',async ()=>response(++calls===1?{labels:[{text:'3.125 × 3 m',room_hint:null,floor:0,width_m:3.125,length_m:3}]}:{...plan,rooms:[room,{...room,id:'overlap',width_m:3.125},{...room,id:'invented',width_m:8,length_m:9,x_m:10}] }));
 const body=await (await createWorker().fetch(request(),{DB:db,OPENAI_API_KEY:'secret'})).json();assert.equal(body.rooms[0].width_m,3.125);assert.equal(body.rooms[0].x_m,null);assert.equal(body.rooms[2].width_m,6);assert.equal(body.rooms[2].length_m,4.5);assert.ok(body.warnings.some((w:any)=>w.message==='check layout'));const saved=JSON.parse([...rows.values()][0]);assert.equal(saved.rooms[2].width_m,null);assert.equal(saved.rooms[2].length_m,null);assert.equal(saved.rooms[0].width_m,3.125);
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
