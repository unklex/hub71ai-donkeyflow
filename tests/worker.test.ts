import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../worker/index.ts';
const worker=createWorker({'/index.html':{type:'text/html',base64:Buffer.from('<h1>DonkeyFlow</h1>').toString('base64')}});
const req=(path:string,body:unknown={},method='POST')=>new Request('https://example.test'+path,{method,headers:{'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})});
test('health reports P1 without exposing secret',async()=>{
 const response=await worker.fetch(req('/api/health',null,'GET'),{OPENAI_API_KEY:'test-secret'});
 const body=await response.json();assert.equal(body.status,'ok');assert.equal(body.api_key_configured,true);assert.equal(JSON.stringify(body).includes('test-secret'),false);
});
test('every requested stub returns cached sample data',async()=>{
 for(const [path,body] of Object.entries({'/api/plan':{},'/api/bundle':{budget:3000},'/api/intent':{text:'warm natural'},'/api/sell/detect':{},'/api/render':{bundle_id:'demo'}})){
  const response=await worker.fetch(req(path,body));assert.equal(response.status,200,path);assert.equal((await response.json()).demo,true,path);
 }
});
test('uploads accepted without buffering media',async()=>{
 const data=new FormData();data.append('file',new Blob(['demo']),'plan.png');
 const response=await worker.fetch(new Request('https://example.test/api/plan',{method:'POST',body:data}));assert.equal(response.status,200);
});
test('invalid requests and methods have explicit errors',async()=>{
 assert.equal((await worker.fetch(req('/api/bundle',{budget:-1}))).status,422);
 assert.equal((await worker.fetch(req('/api/intent',{}))).status,422);
 assert.equal((await worker.fetch(req('/api/plan',null,'GET'))).status,405);
 assert.equal((await worker.fetch(req('/api/unknown'))).status,404);
 assert.equal((await worker.fetch(req('/api/plan'),{DEMO_MODE:'0'})).status,501);
});
test('page and unknown assets handled correctly',async()=>{
 assert.match(await (await worker.fetch(req('/',null,'GET'))).text(),/DonkeyFlow/);
 assert.equal((await worker.fetch(req('/missing',null,'GET'))).status,404);
});
