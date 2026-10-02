import snapshot from '../data/catalog.json' with {type:'json'};
import type {D1Database} from './plan.ts';
import type {Category,CatalogRecord} from '../shared/catalog.ts';

const initialized=new WeakMap<D1Database,Promise<void>>();
export async function ensureCatalog(db:D1Database):Promise<void> {
 let pending=initialized.get(db);
 if(!pending){
  pending=(async()=>{
   const imported=await db.prepare('SELECT version FROM catalog_imports WHERE version = ?').bind(snapshot.version).first();
   if(imported)return;
   if(!db.batch)throw new Error('D1 batch is required to import the catalog.');
   for(let start=0;start<snapshot.items.length;start+=50){
    const statements=snapshot.items.slice(start,start+50).map(item=>db.prepare('INSERT INTO catalog (item_id,category,source_category,price_aed,retail_aed,width_m,depth_m,item_json) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET category=excluded.category,source_category=excluded.source_category,price_aed=excluded.price_aed,retail_aed=excluded.retail_aed,width_m=excluded.width_m,depth_m=excluded.depth_m,item_json=excluded.item_json').bind(item.id,item.category,item.source_category,item.price_aed,item.retail_aed,item.width,item.depth,JSON.stringify(item)));
    await db.batch(statements);
   }
   await db.prepare('INSERT INTO catalog_imports (version,row_count) VALUES (?,?) ON CONFLICT(version) DO NOTHING').bind(snapshot.version,snapshot.items.length).run();
  })();initialized.set(db,pending);
  pending.catch(()=>initialized.delete(db));
 }
 await pending;
}
export async function loadCatalog(db:D1Database,categories:Category[]):Promise<CatalogRecord[]> {
 await ensureCatalog(db);
 if(!categories.length)return [];
 const row=await db.prepare(`SELECT json_group_array(json(item_json)) AS items_json FROM catalog WHERE category IN (${categories.map(()=>'?').join(',')})`).bind(...categories).first<{items_json:string}>();
 return JSON.parse(row?.items_json??'[]') as CatalogRecord[];
}
