CREATE TABLE `daily_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`source` text DEFAULT 'garmin' NOT NULL,
	`total_kcal` integer NOT NULL,
	`active_kcal` integer,
	`bmr_kcal` integer,
	`steps` integer,
	`raw_json` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "total_kcal_non_negative" CHECK("daily_activity"."total_kcal" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_date_source_unique` ON `daily_activity` (`date`,`source`);