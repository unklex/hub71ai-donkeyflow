CREATE TABLE IF NOT EXISTS plan_results (
  cache_key TEXT PRIMARY KEY,
  image_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS plan_results_image_hash ON plan_results(image_hash);
