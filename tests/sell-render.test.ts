import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createWorker} from '../worker/index.ts';
import {normalizeDetection} from '../worker/sell.ts';
import {renderSpec} from '../worker/render.ts';
import {frameTimes,suggestedPrice,cashOffer} from '../shared/sell.ts';
const worker=createWorker();
const request=(path:string,body:unknown)=>new Request('https://test'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const frames=[{seen_at_s:0,image_url:'data:image/jpeg;base64,/9j/'}];
const raw={object_key:'sofa-1',category:'sofa',title:'Blue linen sofa',seen_at_s:0,width_cm:200,depth_cm:90,condition:'good',retail_aed:2400,movable:true,box:{x:0.1,y:0.2,width:0.5,height:0.5}};
const bundle={items:[{title:'Blue sofa',category:'sofa',colour:'blue',material:'linen',style_tags:['modern'],width:2,depth:0.9,placement:{room_id:'living'}},{title:'Bed',category:'bed',placement:{room_id:'bedroom'}}]};
const renderInput={bundle,room:{id:'living',type:'living_room',width_m:5,length_m:4},style:{summary:'Natural textures',palette:['#ffffff']}};
test('sampling caps at 20 and condition prices round to 10',()=>{
 assert.deepEqual(frameTimes(6),[0,3]);assert.deepEqual(frameTimes(6.1),[0,3,6]);assert.equal(frameTimes(180).length,20);assert.equal(frameTimes(180).at(-1),57);assert.throws(()=>frameTimes(Infinity));
 assert.equal(suggestedPrice(1000,'like_new'),450);assert.equal(suggestedPrice(1010,'good'),350);assert.equal(suggestedPrice(1020,'fair'),220);assert.equal(cashOffer(1000),600);
});
test('repeated views merge; separate identical pieces survive; built-ins are excluded',()=>{
 const items=normalizeDetection({items:[raw,raw,{...raw,object_key:'sofa-2'},{...raw,movable:false},{...raw,title:'Built-in wardrobe'}]},frames);
 assert.equal(items.length,2);assert.equal(items[0].suggested_price_aed,840);assert.throws(()=>normalizeDetection({items:[{...raw,seen_at_s:3}]},frames));assert.throws(()=>normalizeDetection({items:[{...raw,box:{x:1,y:0,width:1,height:1}}]},frames));
});
test('vision sends frame images with strict schema; errors never become sample results',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_url,options)=>{calls++;const body=JSON.parse(String(options?.body));assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.input[1].content[1].image_url,frames[0].image_url);return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({items:[raw]})}]}]})};
 try{const response=await worker.fetch(request('/api/sell/detect',{frames}),{OPENAI_API_KEY:'test'});assert.equal(response.status,200);assert.equal((await response.json()).items.length,1);
  assert.equal((await worker.fetch(request('/api/sell/detect',{frames:Array(21).fill(frames[0])}))).status,422);assert.equal(calls,1);
  assert.equal((await worker.fetch(request('/api/sell/detect',{frames}))).status,503);
  globalThis.fetch=async()=>new Response('unavailable',{status:429});assert.equal((await worker.fetch(request('/api/sell/detect',{frames}),{OPENAI_API_KEY:'test'})).status,502);
 }finally{globalThis.fetch=original}
});
test('publish persists edited prices and calculates cash from their sum in SQLite',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0001_confused_squadron_supreme.sql',import.meta.url),'utf8'));
 const DB={prepare:(sql:string)=>({bind:(...values:unknown[])=>({first:async<T>()=>sqlite.prepare(sql).get(...values as never[]) as T,run:async()=>sqlite.prepare(sql).run(...values as never[])})})};
 const items=normalizeDetection({items:[raw]},frames);items[0].suggested_price_aed=1230;
 try{const response=await worker.fetch(request('/api/sell/publish',{items,mode:'instant_cash',total_aed:1,cash_offer_aed:1}),{DB});assert.equal(response.status,201);const lot=await response.json();assert.equal(lot.total_aed,1230);assert.equal(lot.cash_offer_aed,738);const row=sqlite.prepare('SELECT lot_json FROM sell_lots WHERE id=?').get(lot.id);assert.deepEqual(JSON.parse(String(row?.lot_json)),lot);
  assert.equal((await worker.fetch(request('/api/sell/publish',{items:[],mode:'move_out_lot'}),{DB})).status,422);
  assert.equal((await worker.fetch(request('/api/sell/publish',{items:[{...items[0],suggested_price_aed:-1}],mode:'instant_cash'}),{DB})).status,422);
 }finally{sqlite.close()}
});
test('render selects living-room items, stores PNG in R2 and reuses equivalent bundle hashes',async()=>{
 const original=globalThis.fetch;let calls=0;const objects=new Map<string,Uint8Array>();
 const RENDERS={head:async(key:string)=>objects.has(key)?{}:null,get:async(key:string)=>objects.has(key)?{body:new Blob([objects.get(key)! as BlobPart]).stream(),httpEtag:'"test"'}:null,put:async(key:string,bytes:Uint8Array)=>{objects.set(key,bytes)}};
 globalThis.fetch=async(_url,options)=>{calls++;const body=JSON.parse(String(options?.body));assert.match(body.prompt,/5 m wide by 4 m/);assert.match(body.prompt,/blue/);assert.match(body.prompt,/linen/);assert.doesNotMatch(body.prompt,/"Bed"/);assert.equal(body.output_format,'png');return Response.json({data:[{b64_json:Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')}]})};
 try{const response=await worker.fetch(request('/api/render',renderInput),{OPENAI_API_KEY:'test',RENDERS});assert.equal(response.status,200);const rendered=await response.json();assert.equal(rendered.cached,false);
  const cached=await worker.fetch(request('/api/render',{...renderInput,bundle:{items:[...bundle.items].reverse()}}),{RENDERS});assert.equal((await cached.json()).bundle_hash,rendered.bundle_hash);assert.equal(calls,1);
  const media=await worker.fetch(new Request('https://test'+rendered.image_url),{RENDERS});assert.equal(media.headers.get('Content-Type'),'image/png');assert.equal((await media.arrayBuffer()).byteLength,8);
  assert.equal((await worker.fetch(new Request('https://test'+rendered.image_url,{headers:{'If-None-Match':'"test"'}}),{RENDERS})).status,304);
  const changed=await worker.fetch(request('/api/render',{...renderInput,room:{...renderInput.room,width_m:6}}),{OPENAI_API_KEY:'test',RENDERS});assert.notEqual((await changed.json()).bundle_hash,rendered.bundle_hash);assert.equal(calls,2);
  assert.equal((await worker.fetch(request('/api/render',renderInput))).status,503);
  assert.throws(()=>renderSpec({...renderInput,room:{...renderInput.room,type:'bedroom'}}));
 }finally{globalThis.fetch=original}
});
