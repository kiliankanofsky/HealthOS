CREATE TABLE `garmin_daily_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`resting_heart_rate` integer,
	`hrv_last_night` integer,
	`hrv_status` text,
	`sleep_score` integer,
	`sleep_duration_sec` integer,
	`vo2_max_running` real,
	`lactate_threshold_hr` integer,
	`lactate_threshold_pace_sec_per_km` real,
	`training_status` text,
	`race_prediction_5k` integer,
	`race_prediction_10k` integer,
	`race_prediction_half_marathon` integer,
	`race_prediction_marathon` integer,
	`raw_json` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `garmin_daily_metrics_date_unique` ON `garmin_daily_metrics` (`date`);--> statement-breakpoint
CREATE TABLE `run_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`garmin_activity_id` integer,
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`activity_type` text NOT NULL,
	`distance_meters` real NOT NULL,
	`duration_seconds` real NOT NULL,
	`avg_pace_sec_per_km` real,
	`avg_heart_rate` integer,
	`max_heart_rate` integer,
	`elevation_gain_meters` real,
	`calories_kcal` real,
	`aerobic_training_effect` real,
	`anaerobic_training_effect` real,
	`training_load` real,
	`vo2_max_run` real,
	`notes` text,
	`raw_json` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	CONSTRAINT "distance_non_negative" CHECK("run_sessions"."distance_meters" >= 0),
	CONSTRAINT "duration_non_negative" CHECK("run_sessions"."duration_seconds" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_session_garmin_activity_unique` ON `run_sessions` (`garmin_activity_id`);