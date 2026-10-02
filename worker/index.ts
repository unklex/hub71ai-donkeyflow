import {analysePlan,type D1Database} from './plan.ts';
import {bundleRequest} from './bundle.ts';
import style from '../data/cache/style.json' with { type: 'json' };
import detected from '../data/cache/detected_items.json' with { type: 'json' };
export interface Env { OPENAI_API_KEY?: string; DEMO_MODE?: string; PLAN_VISION_MODEL?:string; BUNDLE_EXPLANATION_MODEL?:string; DB?:D1Database }
export type Asset = { type: string; base64: string };
export type Assets = Record<string, Asset>;
const methods:Record<string,string>={'/api/health':'GET','/api/plan':'POST','/api/bundle':'POST','/api/intent':'POST','/api/sell/detect':'POST','/api/render':'POST'};
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-DonkeyFlow-Stage':'P1-stub','X-Content-Type-Options':'nosniff'}});
export function createWorker(assets:Assets={}) {
 return {
  async fetch(request:Request, env:Env={}, _ctx?:unknown):Promise<Response> {
   const path=new URL(request.url).pathname;
   if(path.startsWith('/api/')&&path!=='/api/media/render.png'){
    if(!methods[path])return reply({detail:'Not found'},404);
    if(request.method!==methods[path])return reply({detail:'Method not allowed'},405);
    if(path==='/api/plan'){
     const response=await analysePlan(request,env,assets);
     response.headers.set('Cache-Control','no-store');response.headers.set('X-Content-Type-Options','nosniff');return response;
    }
    if(path==='/api/health')return reply({status:'ok',stage:'P2',demo:true,live_ai:!!env.OPENAI_API_KEY&&!!env.DB,runtime:'cloudflare-worker',api_key_configured:!!env.OPENAI_API_KEY,d1_configured:!!env.DB,plan_model:env.PLAN_VISION_MODEL||'gpt-6-astra'});
    if(path==='/api/bundle')return bundleRequest(request,env);
    if(env.DEMO_MODE==='0')return reply({detail:'P1 supports demo stubs only. Enable demo mode.'},501);
    const type=request.headers.get('content-type')||'';
    if(type.includes('multipart/form-data')){
     // Deliberately do not buffer, process or retain uploaded video/image bytes in P1.
     if(!['/api/plan','/api/sell/detect'].includes(path))return reply({detail:'Expected JSON'},422);
    }else{
     try{
      const input=await request.json() as Record<string,unknown>;
      if(!input||typeof input!=='object'||Array.isArray(input))return reply({detail:'Expected a JSON object'},422);
      if(path==='/api/intent'&&typeof input.text!=='string')return reply({detail:'Provide intent text'},422);
      if(path==='/api/render'&&typeof input.bundle_id!=='string')return reply({detail:'Provide bundle_id'},422);
     }catch{return reply({detail:'Invalid JSON'},422)}
    }
    switch(path){
     case '/api/intent':return reply({style,intent:{action:'preview_style'},demo:true,message:'Cached style profile. Live interpretation arrives in a later phase.'});
     case '/api/sell/detect':return reply({items:detected,demo:true});
     case '/api/render':return reply({image_url:'/api/media/render.png',demo:true,message:'Placeholder image. AI room rendering arrives in P5.'});
    }
   }
   if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
   const asset=assets[path==='/'?'/index.html':path];
   if(!asset)return new Response('Not found',{status:404});
   const bytes=Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0));
   return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Cache-Control':path==='/'?'no-cache':'public, max-age=3600','Referrer-Policy':'strict-origin-when-cross-origin'}});
  }
 };
}
export default createWorker();
