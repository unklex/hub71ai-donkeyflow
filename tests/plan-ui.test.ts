import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import type {PlanResult} from '../shared/plan.ts';
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'});
const {RoomEditor,FloorPlan,PlanPicker}=await server.ssrLoadModule('/frontend/src/PlanEditor.tsx') as typeof import('../frontend/src/PlanEditor.tsx');
const {BundleEditor,NeedsChecklist,defaultNeeds}=await server.ssrLoadModule('/frontend/src/BundleEditor.tsx') as typeof import('../frontend/src/BundleEditor.tsx');
const {OrderEditor}=await server.ssrLoadModule('/frontend/src/OrderEditor.tsx') as typeof import('../frontend/src/OrderEditor.tsx');
await server.close();

test('bundle change form shows parsed chips, fallback hint, undo and solver notes',()=>{
 const bundle={id:'test',items:[],placements:[],total_aed:0,retail_aed:0,saving_pct:0,co2_kg:0,explanation:'Computed facts.',warnings:[],notes:['No cheaper sofa fits your rooms and budget.'],omitted:[],pins:{},needed_categories:[],budget_aed:8000,style:[]} as import('../frontend/src/BundleEditor.tsx').Bundle;
 const html=renderToStaticMarkup(React.createElement(BundleEditor,{bundle,needs:[],budget:8000,busy:false,onBudget:()=>{},onAction:async()=>{},onRemove:()=>{},onAdd:()=>{},onMessage:()=>{},onIntent:async()=>{},canUndo:true,onUndo:()=>{},intent:{source:'rules',reply:'Trying your changes.',actions:[{kind:'colour',category:'coffee_table',color:'grey',budget_aed:null,style_tags:[]},{kind:'budget',category:null,color:null,budget_aed:8000,style_tags:[]}]}}));
 assert.match(html,/Tell us what to change/);assert.match(html,/rows="2"/);assert.match(html,/maxLength="500"/);assert.match(html,/Update bundle/);assert.match(html,/Colour grey · Coffee table/);assert.match(html,/Budget · AED.*8,000/);assert.match(html,/Understood with basic rules/);assert.match(html,/>Undo</);assert.match(html,/No cheaper sofa fits/);assert.ok(html.indexOf('Tell us what to change')<html.indexOf('Paste a Dubizzle link'));
});
test('order renders pickup count, one truck, assembly choices and editable request fields',()=>{
 const bundle={id:'order',items:[{id:'sofa',title:'Test sofa',price_aed:1000},{id:'bed',title:'Test bed',price_aed:500}]} as import('../frontend/src/BundleEditor.tsx').Bundle;
 const html=renderToStaticMarkup(React.createElement(OrderEditor,{bundle,propertyKind:'townhouse'}));
 assert.match(html,/Number of pickup points/);assert.match(html,/1 truck/);assert.match(html,/Assembly · 0 items/);assert.match(html,/250 \+ 2 × AED 50/);assert.match(html,/1,850/);assert.match(html,/community gate permit/);assert.match(html,/Open printable request/);assert.match(html,/Download HTML/);assert.match(html,/Resident name/);
});
const plan:PlanResult={property_kind:'townhouse',floors:2,bedrooms:1,dims_source:'printed',total_area_sqm:null,model:'test-model',image_hash:'hash',cached:false,warnings:[],dimension_labels:[],rooms:[{id:'bath',name:'Bathroom',type:'bathroom',floor:0,width_m:null,length_m:2,x_m:null,y_m:null,confidence:.6,furnish:false},{id:'living',name:'Living',type:'living',floor:0,width_m:3.125,length_m:3,x_m:0,y_m:0,confidence:.9,furnish:true},{id:'upper',name:'Bedroom',type:'bedroom',floor:1,width_m:4,length_m:3,x_m:0,y_m:0,confidence:.9,furnish:true}]};
test('editor preserves exact values, highlights unknown sizes and places excluded spaces last',()=>{
 const html=renderToStaticMarkup(React.createElement(RoomEditor,{plan,onChange:()=>{}}));assert.match(html,/value="3.125"/);assert.match(html,/Enter size/);assert.match(html,/unknown-size/);assert.ok(html.indexOf('Living')<html.indexOf('Bathroom'));assert.match(html,/excluded-room/);assert.match(html,/Include furniture/);assert.match(html,/check size/);assert.match(html,/test-model/);
});
test('estimated sizes are labelled in placed and unplaced previews and editable room inputs',()=>{
 const estimated={...plan,dims_source:'estimated',rooms:plan.rooms.map(r=>r.id==='living'?{...r,width_m:4.2,length_m:3.6}:r.id==='upper'?{...r,x_m:null,y_m:null,width_m:4.2,length_m:3.6}:r),warnings:[{room_id:'living',message:'check size',reason:'Typical size used: no printed dimensions. Confirm before buying.'}]} as PlanResult;
 const editor=renderToStaticMarkup(React.createElement(RoomEditor,{plan:estimated,onChange:()=>{}}));assert.match(editor,/≈ 4.2 × 3.6 m/);assert.match(editor,/<small>estimated<\/small>/);assert.match(editor,/value="4.2"/);assert.match(editor,/value="3.6"/);assert.match(editor,/Typical size used/);assert.doesNotMatch(editor,/disabled|readonly/i);
 const preview=renderToStaticMarkup(React.createElement(FloorPlan,{plan:estimated}));assert.equal((preview.match(/≈ 4.2 × 3.6 m/g)||[]).length,1);const upper=renderToStaticMarkup(React.createElement(FloorPlan,{plan:estimated,floor:1}));assert.match(upper,/Estimated rooms to scale/);const printed=renderToStaticMarkup(React.createElement(FloorPlan,{plan}));assert.doesNotMatch(printed,/≈|estimated/);
});
test('two-floor preview renders tabs and only the first floor by default',()=>{
 const html=renderToStaticMarkup(React.createElement(FloorPlan,{plan}));assert.equal((html.match(/role="tab"/g)||[]).length,2);assert.equal((html.match(/<svg/g)||[]).length,1);assert.match(html,/Living/);assert.doesNotMatch(html,/Bedroom/);assert.match(html,/aria-selected="true"/);assert.match(html,/· 1 room/);assert.match(html,/width="3.125"/);assert.match(html,/Floor 2/);assert.doesNotMatch(html,/Enter size/);assert.match(html,/<summary>Other spaces \(1\)<\/summary>/);assert.equal(html.includes('NaN'),false);
});
test('picker offers the catalogue and floor upload controls',()=>{
 const html=renderToStaticMarkup(React.createElement(PlanPicker,{busy:false,onAnalyse:async()=>{}}));assert.match(html,/Yas Acres/);assert.match(html,/Upload floor plan/);assert.match(html,/crop separately/);assert.match(html,/application\/pdf/);
});
test('selecting the second floor shows only its rooms',()=>{
 const html=renderToStaticMarkup(React.createElement(FloorPlan,{plan,floor:1,onFloor:()=>{}}));assert.match(html,/Bedroom/);assert.doesNotMatch(html,/Living|Bathroom/);assert.match(html,/role="tab" aria-selected="true"[^>]*>Floor 2/);assert.doesNotMatch(html,/<h3>Floor/);
});
test('one-floor plans have a heading and no tabs',()=>{
 const single={...plan,floors:1,rooms:plan.rooms.filter(r=>r.floor===0)};const html=renderToStaticMarkup(React.createElement(FloorPlan,{plan:single}));assert.doesNotMatch(html,/role="tab(list)?"/);assert.match(html,/<h3>Floor 1<\/h3>/);
});
test('only furnishable rooms with missing sizes ask for size',()=>{
 const missing={...plan,rooms:plan.rooms.map(r=>r.id==='living'?{...r,width_m:null}:r)};const html=renderToStaticMarkup(React.createElement(FloorPlan,{plan:missing,floor:0}));assert.equal((html.match(/Enter size/g)||[]).length,1);assert.match(html,/<strong>Living<\/strong><span>Enter size/);assert.match(html,/<details><summary>Other spaces \(1\)<\/summary><p>Bathroom<\/p><\/details>/);
});
test('default floor is the first with a sized furnishable room, otherwise zero',()=>{
 const upper={...plan,rooms:plan.rooms.filter(r=>r.id!=='living')};const html=renderToStaticMarkup(React.createElement(FloorPlan,{plan:upper}));assert.match(html,/Bedroom/);assert.doesNotMatch(html,/Bathroom/);const empty={...plan,rooms:plan.rooms.filter(r=>!r.furnish)};const preview=renderToStaticMarkup(React.createElement(FloorPlan,{plan:empty}));assert.match(preview,/No rooms to furnish on this floor/);assert.match(preview,/Bathroom/);assert.doesNotMatch(preview,/Enter size/);
});
test('room editor groups floors in order with other spaces inside each floor',()=>{
 const html=renderToStaticMarkup(React.createElement(RoomEditor,{plan,onChange:()=>{}}));assert.ok(html.indexOf('Floor 1</h3>')<html.indexOf('Living'));assert.ok(html.indexOf('Bathroom')<html.indexOf('Floor 2</h3>'));assert.ok(html.indexOf('Floor 2</h3>')<html.indexOf('Bedroom'));
});
test('checklist derives room groups from the plan and hides unavailable categories',()=>{
 const needs=defaultNeeds(plan);assert.ok(needs.includes('sofa')&&needs.includes('bed'));assert.ok(!needs.includes('washing_machine'));
 const html=renderToStaticMarkup(React.createElement(NeedsChecklist,{plan,needs,onChange:()=>{}}));
 assert.match(html,/<legend>Living · Floor 1<\/legend>/);assert.match(html,/<legend>Bedroom · Floor 2<\/legend>/);assert.doesNotMatch(html,/Appliances|Microwave|Washing machine|Nightstands|Floor lamp|Rug/);assert.doesNotMatch(html,/<legend>Bathroom/);
});
test('furniture geometry uses room-local metre coordinates on its own floor',()=>{
 const furniture=[{id:'bed',title:'Test bed',size_estimated:true,placement:{room_id:'upper',x_m:1,y_m:.25,width_m:2,depth_m:1.5}}];
 const html=renderToStaticMarkup(React.createElement(FloorPlan,{plan,furniture,floor:1}));
 assert.equal((html.match(/class="furniture-footprint"/g)||[]).length,1);assert.match(html,/x="1" y="0.25" width="2" height="1.5"/);assert.match(html,/estimated dimensions/);
 assert.ok(html.indexOf('Floor 2')<html.indexOf('Test bed'));
});
