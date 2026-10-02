import type {Env} from './index.ts';
import {ApiError} from './api.ts';
export const spendValue=(value:string|undefined,fallback:number)=>{const n=value===undefined?fallback:Number(value);return Number.isFinite(n)&&n>=0?n:fallback};
export async function reserveSpend(env:Env,endpoint:string,model:string,estUsd:number):Promise<number>{
 const unavailable=()=>new ApiError('AI spend tracking is unavailable. Check database migrations.',503);
 if(!env.DB||!Number.isFinite(estUsd)||estUsd<0)throw unavailable();
 let result:{id:number}|null;try{result=await env.DB.prepare('INSERT INTO api_spend (endpoint,model,est_usd) SELECT ?,?,? WHERE (SELECT COALESCE(SUM(COALESCE(actual_usd,est_usd)),0) FROM api_spend) + ? <= ? RETURNING id').bind(endpoint,model,estUsd,estUsd,spendValue(env.SPEND_LIMIT_USD,5)).first<{id:number}>()}catch(error){console.error('spend accounting failed',error);throw unavailable()}
 if(!result)throw new ApiError('Demo AI budget reached. Showing saved results only.',429);return result.id;
}
export async function recordActual(env:Env,id:number,usd:number):Promise<void>{
 if(!env.DB||!Number.isFinite(usd)||usd<0)throw new ApiError('Spend accounting is unavailable.',503);
 await env.DB.prepare('UPDATE api_spend SET actual_usd = ? WHERE id = ?').bind(usd,id).run();
}
