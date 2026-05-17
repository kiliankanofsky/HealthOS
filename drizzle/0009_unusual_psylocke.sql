CREATE TABLE `garmin_tokens` (
	`id` integer PRIMARY KEY NOT NULL,
	`oauth1_json` text NOT NULL,
	`oauth2_json` text NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
