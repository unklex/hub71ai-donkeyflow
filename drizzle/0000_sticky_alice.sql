CREATE TABLE `catalog` (
	`item_id` text PRIMARY KEY NOT NULL,
	`category` text,
	`source_category` text NOT NULL,
	`price_aed` real NOT NULL,
	`retail_aed` real,
	`width_m` real,
	`depth_m` real,
	`item_json` text NOT NULL,
	CONSTRAINT "catalog_price_nonnegative" CHECK("catalog"."price_aed" >= 0),
	CONSTRAINT "catalog_retail_nonnegative" CHECK("catalog"."retail_aed" >= 0),
	CONSTRAINT "catalog_json_valid" CHECK(json_valid("catalog"."item_json"))
);
--> statement-breakpoint
CREATE INDEX `catalog_category_price` ON `catalog` (`category`,`price_aed`,`item_id`);--> statement-breakpoint
CREATE TABLE `catalog_imports` (
	`version` text PRIMARY KEY NOT NULL,
	`row_count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_results` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`image_hash` text NOT NULL,
	`model` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plan_results_image_hash` ON `plan_results` (`image_hash`);