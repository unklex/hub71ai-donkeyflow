import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import type {PlanResult} from '../shared/plan.ts';
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'});
const {RoomEditor,FloorPlan,PlanPicker}=await server.ssrLoadModule('/frontend/src/PlanEditor.tsx') as typeof import('../frontend/src/PlanEditor.tsx');
const {NeedsChecklist,defaultNeeds}=await server.ssrLoadModule('/frontend/src/BundleEditor.tsx') as typeof import('../frontend/src/BundleEditor.tsx');
await server.close();
const plan:PlanResult={property_kind:'townhouse',floors:2,bedrooms:1,dims_source:'printed',total_area_sqm:null,model:'test-model',image_hash:'hash',cached:false,warnings:[],dimension_labels:[],rooms:[{id:'bath',name:'Bathroom',type:'bathroom',floor:0,width_m:null,length_m:2,x_m:null,y_m:null,confidence:.6,furnish:false},{id:'living',name:'Living',type:'living',floor:0,width_m:3.125,length_m:3,x_m:0,y_m:0,confidence:.9,furnish:true},{id:'upper',name:'Bedroom',type:'bedroom',floor:1,width_m:4,length_m:3,x_m:0,y_m:0,confidence:.9,furnish:true}]};
test('editor preserves exact values, highlights unknown sizes and places excluded spaces last',()=>{
 const html=renderToStaticMarkup(React.createElement(RoomEditor,{plan,onChange:()=>{}}));assert.match(html,/value="3.125"/);assert.match(html,/Enter size/);assert.match(html,/unknown-size/);assert.ok(html.indexOf('Living')<html.indexOf('Bathroom'));assert.match(html,/excluded-room/);assert.match(html,/Include furniture/);assert.match(html,/check size/);assert.match(html,/test-model/);
});
test('preview draws separate floors to scale and keeps unknown sizes out of geometry',()=>{
 const html=renderToStaticMarkup(React.createElement(FloorPlan,{plan}));assert.equal((html.match(/<svg/g)||[]).length,2);assert.match(html,/width="3.125"/);assert.match(html,/Floor 2/);assert.match(html,/Enter size/);assert.equal(html.includes('NaN'),false);
});
test('picker offers the catalogue and floor upload controls',()=>{
 const html=renderToStaticMarkup(React.createElement(PlanPicker,{busy:false,onAnalyse:async()=>{}}));assert.match(html,/Yas Acres/);assert.match(html,/Upload floor plan/);assert.match(html,/crop separately/);assert.match(html,/application\/pdf/);
});
test('checklist derives room groups from the plan and exposes appliances',()=>{
 const needs=defaultNeeds(plan);assert.ok(needs.includes('sofa')&&needs.includes('bed'));assert.ok(!needs.includes('washing_machine'));
 const html=renderToStaticMarkup(React.createElement(NeedsChecklist,{plan,needs,onChange:()=>{}}));
 assert.match(html,/<legend>Living · Floor 1<\/legend>/);assert.match(html,/<legend>Bedroom · Floor 2<\/legend>/);assert.match(html,/<legend>Appliances<\/legend>/);assert.match(html,/Microwave/);assert.match(html,/Washing machine/);assert.doesNotMatch(html,/<legend>Bathroom/);
});
test('furniture geometry uses room-local metre coordinates on its own floor',()=>{
 const furniture=[{id:'bed',title:'Test bed',size_estimated:true,placement:{room_id:'upper',x_m:1,y_m:.25,width_m:2,depth_m:1.5}}];
 const html=renderToStaticMarkup(React.createElement(FloorPlan,{plan,furniture}));
 assert.equal((html.match(/class="furniture-footprint"/g)||[]).length,1);assert.match(html,/x="1" y="0.25" width="2" height="1.5"/);assert.match(html,/estimated dimensions/);
 assert.ok(html.indexOf('Floor 2')<html.indexOf('Test bed'));
});
