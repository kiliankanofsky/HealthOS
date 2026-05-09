ALTER TABLE `workout_sessions` ADD `garmin_activity_id` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `session_garmin_activity_unique` ON `workout_sessions` (`garmin_activity_id`);