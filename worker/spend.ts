import type {Env} from './index.ts';
import {ApiError} from './api.ts';
export const spendValue=(value:string|undefined,fallback:number)=>{const n=value===undefined?fallback:Number(value);return Number.isFinite(n)&&n>=0?n:fallback};
export async function reserveSpend(env:Env,endpoint:string,model:string,estUsd:number):Promise<number>{
 const refused=()=>new ApiError('Demo AI budget reached. Showing saved results only.',429);
 if(!env.DB||!Number.isFinite(estUsd)||estUsd<0)throw refused();
 try{const result=await env.DB.prepare('INSERT INTO api_spend (endpoint,model,est_usd) SELECT ?,?,? WHERE (SELECT COALESCE(SUM(COALESCE(actual_usd,est_usd)),0) FROM api_spend) + ? <= ? RETURNING id').bind(endpoint,model,estUsd,estUsd,spendValue(env.SPEND_LIMIT_USD,5)).first<{id:number}>();if(!result)throw refused();return result.id}catch{throw refused()}
}
export async function recordActual(env:Env,id:number,usd:number):Promise<void>{
 if(!env.DB||!Number.isFinite(usd)||usd<0)throw new ApiError('Spend accounting is unavailable.',503);
 await env.DB.prepare('UPDATE api_spend SET actual_usd = ? WHERE id = ?').bind(usd,id).run();
}
