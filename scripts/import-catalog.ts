import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {normalizeCatalog} from '../shared/catalog.ts';

export async function catalogSql(source:string):Promise<{sql:string;count:number;eligible:number}> {
 const raw:unknown=JSON.parse(await readFile(source,'utf8'));
 if(!Array.isArray(raw)||raw.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw new Error('Catalog must be an array of objects.');
 const items=normalizeCatalog(raw);
 const quote=(v:unknown)=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
 const schema=await readFile(new URL('../migrations/0002_catalog.sql',import.meta.url),'utf8');
 const statements=items.map(item=>`INSERT INTO catalog (item_id,category,source_category,price_aed,retail_aed,width_m,depth_m,item_json) VALUES (${[item.id,item.category,item.source_category,item.price_aed,item.retail_aed,item.width,item.depth,JSON.stringify(item)].map(quote).join(',')}) ON CONFLICT(item_id) DO UPDATE SET category=excluded.category,source_category=excluded.source_category,price_aed=excluded.price_aed,retail_aed=excluded.retail_aed,width_m=excluded.width_m,depth_m=excluded.depth_m,item_json=excluded.item_json;`);
 return {sql:schema+'\n'+statements.join('\n')+'\n',count:items.length,eligible:items.filter(i=>i.category&&i.width&&i.depth).length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const source=resolve(process.argv[2]??'../catalog.json');const output=resolve(process.argv[3]??'data/catalog.seed.sql');
 const {sql,count,eligible}=await catalogSql(source);await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,sql);
 const items=normalizeCatalog(JSON.parse(await readFile(source,'utf8')));
 const version=createHash('sha256').update(JSON.stringify(items)).digest('hex');
 await writeFile(new URL('../data/catalog.json',import.meta.url),JSON.stringify({version,items},null,2)+'\n');
 console.log(`Prepared ${count} catalog rows (${eligible} with supported category and known footprint) in ${output}`);
}
