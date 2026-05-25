CREATE TABLE `daily_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`cheat_day` integer DEFAULT false NOT NULL,
	`alcohol` integer DEFAULT false NOT NULL,
	`cheat_meal` integer DEFAULT false NOT NULL,
	`kcal_target` integer,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_tags_date_unique` ON `daily_tags` (`date`);--> statement-breakpoint
-- Bestehende Tag-Daten aus weight_entries übernehmen, BEVOR die Spalten
-- entfernt werden. Nur Zeilen mit mindestens einem gesetzten Tag oder
-- einem kcal_target werden übernommen — leere Zeilen kosten nur Speicher.
INSERT INTO `daily_tags` (`date`, `cheat_day`, `alcohol`, `cheat_meal`, `kcal_target`)
SELECT `date`, `cheat_day`, `alcohol`, `cheat_meal`, `kcal_target`
FROM `weight_entries`
WHERE `cheat_day` = 1 OR `alcohol` = 1 OR `cheat_meal` = 1 OR `kcal_target` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `weight_entries` DROP COLUMN `cheat_day`;--> statement-breakpoint
ALTER TABLE `weight_entries` DROP COLUMN `alcohol`;--> statement-breakpoint
ALTER TABLE `weight_entries` DROP COLUMN `cheat_meal`;--> statement-breakpoint
ALTER TABLE `weight_entries` DROP COLUMN `kcal_target`;
