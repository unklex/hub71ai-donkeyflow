import {spendValue} from './spend.ts';
import {analysePlan,type D1Database} from './plan.ts';
import {bundleRequest} from './bundle.ts';
import style from '../data/cache/style.json' with { type: 'json' };
import {detectSell,publishLot} from './sell.ts';
import {renderRoom,renderMedia,type R2Bucket} from './render.ts';
export interface Env { OPENAI_API_KEY?: string; DEMO_MODE?: string; PLAN_VISION_MODEL?:string; PLAN_REASONING_EFFORT?:string; SPEND_LIMIT_USD?:string; COST_PLAN_CALL_USD?:string; COST_DETECT_USD?:string; COST_RENDER_USD?:string; COST_EXPLAIN_USD?:string; BUNDLE_EXPLANATION_MODEL?:string; SELL_VISION_MODEL?:string; IMAGE_MODEL?:string; DB?:D1Database; RENDERS?:R2Bucket }
export type Asset = { type: string; base64: string };
export type Assets = Record<string, Asset>;
const methods:Record<string,string>={'/api/health':'GET','/api/plan':'POST','/api/bundle':'POST','/api/intent':'POST','/api/sell/detect':'POST','/api/sell/publish':'POST','/api/render':'POST'};
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function createWorker(assets:Assets={}) {
 return {
  async fetch(request:Request, env:Env={}, _ctx?:unknown):Promise<Response> {
   const path=new URL(request.url).pathname;
   if(path.startsWith('/api/media/renders/'))return renderMedia(request,env,path);
   if(path.startsWith('/api/')&&path!=='/api/media/render.png'){
    if(!methods[path])return reply({detail:'Not found'},404);
    if(request.method!==methods[path])return reply({detail:'Method not allowed'},405);
    if(path==='/api/plan'){
     const response=await analysePlan(request,env,assets);
     response.headers.set('Cache-Control','no-store');response.headers.set('X-Content-Type-Options','nosniff');return response;
    }
    if(path==='/api/health'){const limit_usd=spendValue(env.SPEND_LIMIT_USD,5);let spent_usd:number|null=null;try{if(env.DB)spent_usd=Number((await env.DB.prepare('SELECT COALESCE(SUM(COALESCE(actual_usd,est_usd)),0) AS spent_usd FROM api_spend').bind().first<{spent_usd:number}>())?.spent_usd??0)}catch{}return reply({spent_usd,limit_usd,spend_tracking:spent_usd===null?'unavailable':'ok',remaining_usd:spent_usd===null?null:Math.max(0,limit_usd-spent_usd),status:'ok',live_ai:!!env.OPENAI_API_KEY&&!!env.DB,runtime:'cloudflare-worker',api_key_configured:!!env.OPENAI_API_KEY,d1_configured:!!env.DB,r2_configured:!!env.RENDERS,plan_model:env.PLAN_VISION_MODEL||'gpt-6-astra',sell_model:env.SELL_VISION_MODEL||'gpt-4.1-mini',image_model:env.IMAGE_MODEL||'gpt-image-1'})};
    if(path==='/api/bundle')return bundleRequest(request,env);
    if(path==='/api/sell/detect')return detectSell(request,env);
    if(path==='/api/sell/publish')return publishLot(request,env);
    if(path==='/api/render')return renderRoom(request,env);
    if(env.DEMO_MODE==='0')return reply({detail:'Style preview is unavailable right now.'},501);
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
     case '/api/intent':return reply({style,intent:{action:'preview_style'},demo:true,message:'Style preview loaded.'});
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
