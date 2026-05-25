ALTER TABLE `garmin_daily_metrics` ADD `deep_sleep_sec` integer;--> statement-breakpoint
ALTER TABLE `garmin_daily_metrics` ADD `light_sleep_sec` integer;--> statement-breakpoint
ALTER TABLE `garmin_daily_metrics` ADD `rem_sleep_sec` integer;--> statement-breakpoint
ALTER TABLE `garmin_daily_metrics` ADD `awake_sleep_sec` integer;--> statement-breakpoint
ALTER TABLE `garmin_daily_metrics` ADD `sleep_start_local` text;--> statement-breakpoint
ALTER TABLE `garmin_daily_metrics` ADD `sleep_end_local` text;--> statement-breakpoint
ALTER TABLE `garmin_daily_metrics` ADD `sleep_quality` text;--> statement-breakpoint
ALTER TABLE `garmin_daily_metrics` ADD `hrv_baseline_low_upper` real;--> statement-breakpoint
ALTER TABLE `garmin_daily_metrics` ADD `hrv_baseline_balanced_low` real;--> statement-breakpoint
ALTER TABLE `garmin_daily_metrics` ADD `hrv_baseline_balanced_upper` real;--> statement-breakpoint
ALTER TABLE `garmin_daily_metrics` ADD `hrv_baseline_marker` real;--> statement-breakpoint
ALTER TABLE `garmin_daily_metrics` ADD `resting_heart_rate_7d_avg` integer;