CREATE TABLE `nutrition_exclusions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`label` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
-- Der Google-Sheets-Import ist ausgebaut (letzter Stand 29.06.2026). Die von
-- ihm abgeleiteten Phasen bleiben erhalten, gehören ab jetzt aber dem Nutzer:
-- `phaseSources` in schema.ts kennt nur noch "manual".
UPDATE `weight_phases` SET `source` = 'manual' WHERE `source` = 'sheets';
