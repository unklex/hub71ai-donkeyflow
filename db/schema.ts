import {sql} from 'drizzle-orm';
import {sqliteTable,text,real,integer,index,check} from 'drizzle-orm/sqlite-core';
export const planResults=sqliteTable('plan_results',{
 cacheKey:text('cache_key').primaryKey(),imageHash:text('image_hash').notNull(),model:text('model').notNull(),resultJson:text('result_json').notNull(),createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)
},t=>[index('plan_results_image_hash').on(t.imageHash)]);
export const catalog=sqliteTable('catalog',{
 itemId:text('item_id').primaryKey(),category:text('category'),sourceCategory:text('source_category').notNull(),priceAed:real('price_aed').notNull(),retailAed:real('retail_aed'),widthM:real('width_m'),depthM:real('depth_m'),itemJson:text('item_json').notNull()
},t=>[index('catalog_category_price').on(t.category,t.priceAed,t.itemId),check('catalog_price_nonnegative',sql`${t.priceAed} >= 0`),check('catalog_retail_nonnegative',sql`${t.retailAed} >= 0`),check('catalog_json_valid',sql`json_valid(${t.itemJson})`)]);
export const catalogImports=sqliteTable('catalog_imports',{version:text('version').primaryKey(),rowCount:integer('row_count').notNull()});
