CREATE TABLE `weight_phases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`label` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weight_phases_start_date_unique` ON `weight_phases` (`start_date`);--> statement-breakpoint
ALTER TABLE `weight_entries` ADD `cheat_day` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `weight_entries` ADD `alcohol` integer DEFAULT false NOT NULL;