CREATE TABLE `dashboard_overviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`endurance_text` text NOT NULL,
	`hypertrophy_text` text NOT NULL,
	`weight_text` text NOT NULL,
	`model` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dashboard_overviews_date_unique` ON `dashboard_overviews` (`date`);