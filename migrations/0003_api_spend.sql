CREATE TABLE `api_spend` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`endpoint` text NOT NULL,
	`model` text NOT NULL,
	`est_usd` real NOT NULL,
	`actual_usd` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
