import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function spendDatabase(){const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/0003_api_spend.sql',import.meta.url),'utf8'));return {prepare:(sql:string)=>({bind:(...values:unknown[])=>({first:async<T>()=>(sqlite.prepare(sql).get(...values as never[])??null) as T|null,run:async()=>sqlite.prepare(sql).run(...values as never[])})})}}
