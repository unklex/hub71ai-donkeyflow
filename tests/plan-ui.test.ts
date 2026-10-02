import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import type {PlanResult} from '../shared/plan.ts';
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'});
const {RoomEditor,FloorPlan,PlanPicker}=await server.ssrLoadModule('/frontend/src/PlanEditor.tsx') as typeof import('../frontend/src/PlanEditor.tsx');
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
