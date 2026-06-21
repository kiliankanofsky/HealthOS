ALTER TABLE `workout_templates` ADD `color` text;--> statement-breakpoint
ALTER TABLE `workout_templates` ADD `letter` text;--> statement-breakpoint
ALTER TABLE `workout_templates` ADD `in_rotation` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_templates` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_templates` ADD `archived` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill der 3 Original-Einheiten (Visuals + Rotations-Reihenfolge), damit die
-- UI ausschließlich row-basierte Visuals lesen kann. Manuell ergänzt (Muster 0012).
UPDATE `workout_templates` SET `color` = 'indigo',  `letter` = 'A', `sort_order` = 0 WHERE `kind` = 'upper-a';--> statement-breakpoint
UPDATE `workout_templates` SET `color` = 'emerald', `letter` = 'L', `sort_order` = 1 WHERE `kind` = 'lower';--> statement-breakpoint
UPDATE `workout_templates` SET `color` = 'orange',  `letter` = 'B', `sort_order` = 2 WHERE `kind` = 'upper-b';