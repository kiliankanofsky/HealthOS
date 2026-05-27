CREATE TABLE `training_plan_blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`block_order` integer NOT NULL,
	`repetitions` integer DEFAULT 1 NOT NULL,
	`segments_json` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `training_plan_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "repetitions_positive" CHECK("training_plan_blocks"."repetitions" >= 1),
	CONSTRAINT "block_order_positive" CHECK("training_plan_blocks"."block_order" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `block_session_order_unique` ON `training_plan_blocks` (`session_id`,`block_order`);--> statement-breakpoint
CREATE TABLE `training_plan_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`week_id` integer NOT NULL,
	`date` text NOT NULL,
	`day_order` integer DEFAULT 1 NOT NULL,
	`session_type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`target_duration_sec` integer,
	`target_distance_meters` real,
	`primary_zone` integer,
	`status` text DEFAULT 'planned' NOT NULL,
	`ai_locked` integer DEFAULT false NOT NULL,
	`alternative_of_id` integer,
	`selected_alternative_id` integer,
	`run_session_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `training_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`week_id`) REFERENCES `training_plan_weeks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_session_id`) REFERENCES `run_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "day_order_positive" CHECK("training_plan_sessions"."day_order" >= 1),
	CONSTRAINT "primary_zone_range" CHECK("training_plan_sessions"."primary_zone" IS NULL OR ("training_plan_sessions"."primary_zone" >= 1 AND "training_plan_sessions"."primary_zone" <= 5))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_session_date_order_unique` ON `training_plan_sessions` (`plan_id`,`date`,`day_order`,`alternative_of_id`);--> statement-breakpoint
CREATE TABLE `training_plan_weeks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`week_number` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`phase` text NOT NULL,
	`target_volume_km` real,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `training_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "week_number_positive" CHECK("training_plan_weeks"."week_number" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_week_unique` ON `training_plan_weeks` (`plan_id`,`week_number`);--> statement-breakpoint
CREATE TABLE `training_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`goal_type` text DEFAULT 'race' NOT NULL,
	`race_name` text,
	`race_date` text,
	`race_distance_km` real,
	`target_time_seconds` integer,
	`target_pace_sec_per_km` real,
	`target_weekly_km_peak` real,
	`sessions_per_week` integer,
	`plan_start_date` text NOT NULL,
	`total_weeks` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`pace_zones_json` text,
	`reference_pdf_text` text,
	`reference_pdf_name` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "total_weeks_positive" CHECK("training_plans"."total_weeks" >= 1),
	CONSTRAINT "target_pace_non_negative" CHECK("training_plans"."target_pace_sec_per_km" IS NULL OR "training_plans"."target_pace_sec_per_km" >= 0)
);
