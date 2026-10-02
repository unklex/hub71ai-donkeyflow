CREATE TABLE `sell_lots` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`total_aed` real NOT NULL,
	`cash_offer_aed` real NOT NULL,
	`lot_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "sell_lots_mode" CHECK("sell_lots"."mode" in ('move_out_lot','instant_cash')),
	CONSTRAINT "sell_lots_total" CHECK("sell_lots"."total_aed" >= 0),
	CONSTRAINT "sell_lots_json" CHECK(json_valid("sell_lots"."lot_json"))
);
