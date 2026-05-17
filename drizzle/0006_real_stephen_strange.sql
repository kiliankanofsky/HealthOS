CREATE TABLE `nutrition_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`source` text DEFAULT 'fddb' NOT NULL,
	`calories_kcal` integer NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`fiber_g` real,
	`sugar_g` real,
	`raw_json` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "calories_non_negative" CHECK("nutrition_entries"."calories_kcal" >= 0),
	CONSTRAINT "protein_non_negative" CHECK("nutrition_entries"."protein_g" >= 0),
	CONSTRAINT "carbs_non_negative" CHECK("nutrition_entries"."carbs_g" >= 0),
	CONSTRAINT "fat_non_negative" CHECK("nutrition_entries"."fat_g" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_date_source_unique` ON `nutrition_entries` (`date`,`source`);