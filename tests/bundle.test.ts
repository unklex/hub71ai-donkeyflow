import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {parseBundleInput,solveBundle,type BundleInput} from '../worker/bundle.ts';
import {createWorker} from '../worker/index.ts';
import {normalizeCatalog,optionalDropOrder,type CatalogItem,type Category} from '../shared/catalog.ts';
import type {D1Database,D1Statement} from '../worker/plan.ts';
import snapshot from '../data/catalog.json' with {type:'json'};
const rooms=[{id:'living',type:'living',name:'Living',floor:0,width_m:6,length_m:7},{id:'bedroom',type:'bedroom',name:'Bedroom',floor:1,width_m:5,length_m:5},{id:'study',type:'study',name:'Study',floor:1,width_m:3.125,length_m:3}];
const input=(needed_categories:Category[],budget_aed=1000,pins:BundleInput['pins']={}):BundleInput=>({rooms,needed_categories,style:[],budget_aed,pins});
const item=(id:string,category:Category,price_aed=100,retail_aed=200,width=.5,depth=.5):CatalogItem=>({id,title:id,category,price_aed,retail_aed,width,depth,height:.5,area:'Abu Dhabi',style_tags:[],size_estimated:false});
function database(){
 const sqlite=new DatabaseSync(':memory:');
 const wrap=(sql:string,values:unknown[]):D1Statement=>({first:async<T>()=>(sqlite.prepare(sql).get(...values as (string|number|null)[])??null) as T|null,run:async()=>sqlite.prepare(sql).run(...values as (string|number|null)[])});
 const db:D1Database={prepare:(sql:string)=>({bind:(...values:unknown[])=>wrap(sql,values)}),batch:async statements=>{sqlite.exec('BEGIN');try{const results=await Promise.all(statements.map(s=>s.run()));sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}};
 return {db,sqlite};
}
test('footprint clearance excludes unknown dimensions and oversized pieces; rotation uses the right wall axes',()=>{
 const req=input(['sofa','wardrobe'],200);req.rooms=[{...rooms[0],width_m:3,length_m:4},{...rooms[1],width_m:3,length_m:4}];
 const unknown={...item('unknown','sofa',0),width:null};
 const result=solveBundle(req,[unknown,item('big','sofa',1,20,2.401,1),item('exact','sofa',100,200,2.4,1),item('ward','wardrobe',100,200,3.3,.5)]);
 assert.deepEqual(result.items.map(i=>i.id),['exact','ward']);
 const ward=result.items.find(i=>i.id==='ward')!.placement;assert.equal(ward.rotation,90);assert.equal(ward.width_m,.5);assert.equal(ward.depth_m,3.3);assert.equal(ward.x_m,2.5);
});
test('optional categories are dropped in the exact requested order and pinned optionals survive',()=>{
 const catalog=[item('bed','bed'),...optionalDropOrder.map(c=>item(c,c))];
 for(let drop=1;drop<=optionalDropOrder.length;drop++){
  const req=input(['bed',...optionalDropOrder],700-drop*100);req.rooms=rooms.map(r=>({...r,width_m:20,length_m:20}));
  const result=solveBundle(req,catalog);
  assert.deepEqual(result.omitted.filter(o=>o.reason==='dropped to fit budget').map(o=>o.category),optionalDropOrder.slice(0,drop));
  assert.ok(result.total_aed<=req.budget_aed);
 }
 const result=solveBundle(input(['bed','floor_lamp','rug'],200,{floor_lamp:'floor_lamp'}),catalog);
 assert.ok(result.items.some(i=>i.id==='floor_lamp'));assert.equal(result.omitted[0].category,'rug');
});
test('greedy upgrades recalculate marginal retail / price ratio, handle free upgrades, and stop at budget',()=>{
 const catalog=[item('s0','sofa',100,100),item('s1','sofa',200,600),item('s2','sofa',300,650),item('b0','bed',100,100),item('b1','bed',200,300)];
 const result=solveBundle(input(['bed','sofa'],400),catalog);assert.deepEqual(result.items.map(i=>i.id),['b1','s1']);assert.equal(result.total_aed,400);
 const free=solveBundle(input(['sofa'],100),[item('s0','sofa',100,100),item('sfree','sofa',100,500)]);assert.equal(free.items[0].id,'sfree');
 assert.deepEqual(solveBundle(input(['bed','sofa'],400),catalog.reverse()),result);
 const pennies=solveBundle(input(['sofa'],.3),[item('p','sofa',.1,.2),item('q','sofa',.3,.5)]);assert.equal(pennies.total_aed,.3);assert.equal(pennies.remaining_aed,0);
});
test('pins cannot be upgraded, removed, substituted, or silently overspend',()=>{
 const catalog=[item('cheap','sofa',100,100),item('best','sofa',200,1000)];
 assert.equal(solveBundle(input(['sofa'],300,{sofa:'cheap'}),catalog).items[0].id,'cheap');
 assert.equal(solveBundle(input(['sofa'],300,{sofa:'remove'}),catalog).items.length,0);
 assert.throws(()=>solveBundle(input(['sofa'],300,{sofa:'missing'}),catalog),/Pinned item/);
 assert.throws(()=>solveBundle(input(['sofa'],100,{sofa:'best'}),catalog),/Required and pinned/);
 assert.throws(()=>solveBundle(input(['bed'],50),[item('bed','bed')]),/Required and pinned/);
 assert.throws(()=>solveBundle(input(['sofa'],300,{sofa:'big'}),[item('big','sofa',100,100,10,10)]),/does not fit/);
});
test('anchors remain inside rooms, nightstand is beside bed, coffee table ahead of sofa and desk in study',()=>{
 const needed:Category[]=['bed','nightstands','sofa','tv_unit','coffee_table','dining_set','desk'];
 const result=solveBundle(input(needed,700),needed.map(c=>item(c,c)));
 for(const p of result.placements){const r=rooms.find(r=>r.id===p.room_id)!;assert.ok(p.x_m>=0&&p.y_m>=0&&p.x_m+p.width_m<=r.width_m&&p.y_m+p.depth_m<=r.length_m)}
 const placement=(c:Category)=>result.items.find(i=>i.category===c)!.placement;
 assert.equal(placement('bed').y_m,0);assert.equal(placement('bed').x_m,2.25);
 assert.ok(placement('nightstands').x_m<placement('bed').x_m);
 assert.equal(placement('sofa').y_m,6.5);assert.equal(placement('tv_unit').y_m,0);
 assert.equal(placement('coffee_table').y_m+placement('coffee_table').depth_m,placement('sofa').y_m-.6);
 assert.equal(placement('dining_set').x_m,5.5);assert.equal(placement('desk').room_id,'study');
});
test('walk-in closet overrides wardrobe pins even when excluded from furnishing',()=>{
 const req=input(['wardrobe'],300,{wardrobe:'ward'});req.rooms=[...rooms,{id:'closet',type:'walk_in_closet',name:'Walk-in closet',floor:1,width_m:0,length_m:0,furnish:false}];
 assert.equal(solveBundle(req,[item('ward','wardrobe')]).items.length,0);
});
test('anchor collisions reject required sets and prevent invalid upgrades',()=>{
 const req=input(['sofa','tv_unit'],500);req.rooms=[{...rooms[0],width_m:3,length_m:2}];
 assert.throws(()=>solveBundle(req,[item('s','sofa',100,200,2,1.3),item('tv','tv_unit',100,200,2,1.3)]),/cannot be placed/);
 const bedroomReq=input(['bed','nightstands'],400);bedroomReq.rooms=[{...rooms[1],width_m:3,length_m:4}];
 const result=solveBundle(bedroomReq,[item('b','bed',100,100,1,2),item('large','bed',200,1000,2.4,2),item('n','nightstands',100,200,.6,.4)]);
 assert.equal(result.items.find(i=>i.category==='bed')!.id,'b');
});
test('validation handles unknown sizes, aliases, malformed pins, nonfinite budget, and duplicates',()=>{
 assert.throws(()=>parseBundleInput({...input(['sofa']),budget_aed:NaN}),/budget_aed/);
 assert.throws(()=>parseBundleInput({...input(['sofa']),rooms:[{...rooms[0],width_m:null}]}),/Enter real/);
 assert.throws(()=>parseBundleInput({...input(['sofa']),needed_categories:['sofa','sofa']}),/unique/);
 assert.throws(()=>parseBundleInput({...input(['sofa']),pins:{bed:'id'}}),/must be requested/);
 assert.throws(()=>parseBundleInput({...input(['sofa']),style:[1]}),/style/);
 assert.throws(()=>parseBundleInput({...input(['sofa']),needed_categories:['constructor']}),/Unknown category/);
 const parsed=parseBundleInput({...input(['tv_unit']),needed_categories:['TV unit'],rooms:[{...rooms[0],length_m:undefined,depth_m:7}],style:{tags:['Modern']}});assert.deepEqual(parsed.style,['modern']);assert.equal(parsed.rooms[0].length_m,7);
});
test('D1 schema imports all 400 rows idempotently, uses the index, and serves live bundles without AI',async()=>{
 const {db,sqlite}=database();sqlite.exec(await readFile(new URL('../migrations/0002_catalog.sql',import.meta.url),'utf8'));
 const worker=createWorker();const req=()=>new Request('https://example.test/api/bundle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input(['bed','sofa','desk'],3000))});
 const first=await worker.fetch(req(),{DB:db,DEMO_MODE:'0'});assert.equal(first.status,200);const a=await first.json();
 assert.equal(a.demo,false);assert.equal(a.explanation_source,'deterministic_fallback');assert.ok(a.total_aed<=3000);assert.ok(a.items.length>0);assert.match(a.explanation,/3.125 × 3 m/);assert.match(a.explanation,new RegExp(`total AED ${a.total_aed}`));
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM catalog').get()!.n,400);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM catalog_imports').get()!.n,1);
 const second=await (await worker.fetch(req(),{DB:db})).json();assert.deepEqual(second,a);
 const query=sqlite.prepare('EXPLAIN QUERY PLAN SELECT item_json FROM catalog WHERE category = ?').all('sofa');assert.match(JSON.stringify(query),/catalog_category_price/);
 assert.equal(a.co2_is_estimate,true);assert.equal(a.total_aed,a.items.reduce((s:number,i:any)=>s+i.price_aed,0));assert.equal(a.co2_kg,a.items.reduce((s:number,i:any)=>s+i.co2_kg,0));
 sqlite.close();
});
test('small model only supplies prose with numeric placeholders; failing or fabricated output leaves results intact',async t=>{
 const {db,sqlite}=database();sqlite.exec(await readFile(new URL('../migrations/0002_catalog.sql',import.meta.url),'utf8'));
 const req=()=>new Request('https://example.test/api/bundle',{method:'POST',body:JSON.stringify(input(['sofa'],3000))});
 const mock=t.mock.method(globalThis,'fetch',async (_url:unknown,init:RequestInit)=>{
  const payload=JSON.parse(String(init.body));assert.equal(payload.model,'gpt-4.1-mini');assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);
  return Response.json({status:'completed',model:'small-model',output:[{content:[{type:'output_text',text:JSON.stringify({sentences:['These pieces suit {{ROOM_SIZES}}.','Your {{SPEND}} uses {{TOTAL}} of {{BUDGET}}, leaving {{REMAINING}}.']})}]}]});
 });
 const a=await (await createWorker().fetch(req(),{DB:db,OPENAI_API_KEY:'secret'})).json();assert.equal(a.explanation_source,'model');assert.match(a.explanation,/6 × 7 m/);assert.ok(!a.explanation.includes('{{'));
 mock.mock.mockImplementation(async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({sentences:['Your room is 99 metres.','Spend 9999 AED.']})}]}]}));
 const b=await (await createWorker().fetch(req(),{DB:db,OPENAI_API_KEY:'secret'})).json();assert.equal(b.explanation_source,'deterministic_fallback');assert.deepEqual(b.items,a.items);assert.equal(b.id,a.id);
 mock.mock.mockImplementation(async()=>Response.json({error:'secret'},{status:429}));const c=await (await createWorker().fetch(req(),{DB:db,OPENAI_API_KEY:'secret'})).json();assert.equal(c.explanation_source,'deterministic_fallback');assert.ok(!JSON.stringify(c).includes('secret'));
 sqlite.close();
});
test('normalization does not guess footprint or misclassify tables and office chairs',()=>{
 assert.equal(snapshot.items.length,400);const rows=normalizeCatalog([{item_id:'a',category:'tables',title:'Console Table',price_aed:100,retail_price_new_aed:null,width_cm:null,depth_cm:50},{item_id:'b',category:'chairs-benches-stools',title:'Office chair',price_aed:100,retail_price_new_aed:200,width_cm:50,depth_cm:50}]);
 assert.equal(rows[0].category,null);assert.equal(rows[0].width,null);assert.equal(rows[0].retail_aed,null);assert.equal(rows[1].category,null);
});
