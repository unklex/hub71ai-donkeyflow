export const categories = ['bed','wardrobe','nightstands','sofa','tv_unit','coffee_table','dining_set','desk','armchair','rug','floor_lamp'] as const;
export type Category = typeof categories[number];
export const optionalDropOrder:Category[] = ['floor_lamp','rug','nightstands','armchair','dining_set','desk'];
// Illustrative avoided-new-production factors per purchased listing, not measured emissions.
export const co2Factors:Record<Category,number> = {bed:80,wardrobe:100,nightstands:15,sofa:90,tv_unit:35,coffee_table:20,dining_set:75,desk:30,armchair:40,rug:10,floor_lamp:5};
export type CatalogRecord = {id:string;title:string;category:Category|null;price_aed:number;retail_aed:number|null;width:number|null;depth:number|null;height:number|null;style_tags:string[];area:string;size_estimated:boolean;[key:string]:unknown};
export type CatalogItem = CatalogRecord & {category:Category;retail_aed:number};
export function categoryName(value:string):Category|null {
 const key=value.trim().toLowerCase().replace(/[ -]+/g,'_');
 const aliases:Record<string,Category>={tv:'tv_unit',tv_stand:'tv_unit',nightstand:'nightstands',bedside_table:'nightstands',dining:'dining_set',lamp:'floor_lamp'};
 return categories.includes(key as Category)?key as Category:aliases[key]??null;
}
export function normalizeCatalog(rows:Record<string,unknown>[]):CatalogRecord[] {
 const ids=new Set<string>();
 return rows.map(row=>{
  const title=String(row.title??'');const source=String(row.category??'');
  const mapped:Record<string,Category>={'sofas-futons-lounges':'sofa','beds-bed-sets':'bed','armoires-wardrobes':'wardrobe','entertainment-centers':'tv_unit','dining-sets':'dining_set','study-tables-computer-tables':'desk'};
  let category:Category|undefined=categoryName(source)??mapped[source];
  if(source==='tables')category=/night\s*stand|bedside/i.test(title)?'nightstands':/coffee|cent(?:er|re) table/i.test(title)?'coffee_table':/desk|study|office table/i.test(title)?'desk':undefined;
  if(source==='chairs-benches-stools')category=/armchair|lounge chair|reclin|wingback|rock(?:ing|er)/i.test(title)?'armchair':undefined;
  const id=String(row.item_id??row.id??'');
  if(!id||ids.has(id))throw new Error(`Missing or duplicate catalog ID: ${id}`);ids.add(id);
  if(typeof row.price_aed!=='number'||!Number.isFinite(row.price_aed)||row.price_aed<0)throw new Error(`Invalid price for ${id}`);
  const retail=row.retail_price_new_aed??row.retail_aed??null;
  if(retail!==null&&(typeof retail!=='number'||!Number.isFinite(retail)||retail<0))throw new Error(`Invalid retail price for ${id}`);
  const metres=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0?v/100:null;
  return {...row,id,title,source_category:source,category:category??null,price_aed:row.price_aed,retail_aed:retail,width:metres(row.width_cm),depth:metres(row.depth_cm),height:metres(row.height_cm),style_tags:Array.isArray(row.style_tags)?row.style_tags.filter((s):s is string=>typeof s==='string'):[],area:String(row.area??''),size_estimated:row.size_source!=='printed'&&row.size_source!=='measured',catalog_category:category??null};
 });
}
