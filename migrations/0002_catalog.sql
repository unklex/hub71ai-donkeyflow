CREATE TABLE IF NOT EXISTS catalog (
 item_id TEXT PRIMARY KEY,
 category TEXT,
 source_category TEXT NOT NULL,
 price_aed REAL NOT NULL CHECK(price_aed >= 0),
 retail_aed REAL CHECK(retail_aed >= 0),
 width_m REAL,
 depth_m REAL,
 item_json TEXT NOT NULL CHECK(json_valid(item_json))
);
CREATE INDEX IF NOT EXISTS catalog_category_price ON catalog(category, price_aed, item_id);
CREATE TABLE IF NOT EXISTS catalog_imports (
 version TEXT PRIMARY KEY,
 row_count INTEGER NOT NULL
);
