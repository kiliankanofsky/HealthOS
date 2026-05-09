CREATE TABLE `exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`garmin_name` text,
	`aliases` text,
	`primary_muscles` text NOT NULL,
	`secondary_muscles` text DEFAULT ('[]') NOT NULL,
	`default_rep_min` integer NOT NULL,
	`default_rep_max` integer NOT NULL,
	`unilateral` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercises_slug_unique` ON `exercises` (`slug`);--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_id` integer NOT NULL,
	`date` text NOT NULL,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_template_date_unique` ON `workout_sessions` (`template_id`,`date`);--> statement-breakpoint
CREATE TABLE `workout_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`template_exercise_id` integer NOT NULL,
	`set_number` integer NOT NULL,
	`weight_kg` real NOT NULL,
	`reps` integer NOT NULL,
	`rest_seconds` integer,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_exercise_id`) REFERENCES `workout_template_exercises`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reps_non_negative" CHECK("workout_sets"."reps" >= 0),
	CONSTRAINT "weight_non_negative" CHECK("workout_sets"."weight_kg" >= 0),
	CONSTRAINT "set_number_positive" CHECK("workout_sets"."set_number" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `set_session_exercise_number_unique` ON `workout_sets` (`session_id`,`template_exercise_id`,`set_number`);--> statement-breakpoint
CREATE TABLE `workout_template_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`position` integer NOT NULL,
	`rep_min` integer,
	`rep_max` integer,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_position_unique` ON `workout_template_exercises` (`template_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `template_exercise_unique` ON `workout_template_exercises` (`template_id`,`exercise_id`);--> statement-breakpoint
CREATE TABLE `workout_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_templates_slug_unique` ON `workout_templates` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `workout_templates_kind_unique` ON `workout_templates` (`kind`);