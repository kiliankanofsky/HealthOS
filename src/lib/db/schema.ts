import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Quelle eines Gewichtseintrags. Erweiterbar für künftige Integrationen.
export const weightSources = ["manual", "sheets", "garmin"] as const;
export type WeightSource = (typeof weightSources)[number];

export const weightEntries = sqliteTable("weight_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // ISO-Date YYYY-MM-DD, ein Eintrag pro Tag
  date: text("date").notNull().unique(),
  weightKg: real("weight_kg").notNull(),
  source: text("source", { enum: weightSources }).notNull().default("manual"),
  notes: text("notes"),
  cheatDay: integer("cheat_day", { mode: "boolean" }).notNull().default(false),
  alcohol: integer("alcohol", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type WeightEntry = typeof weightEntries.$inferSelect;
export type NewWeightEntry = typeof weightEntries.$inferInsert;

// Phasen: zusammenhängende Zeiträume mit Trainings-/Ernährungs-Intention.
// `bulk` = Aufbau, `cut` = Defizit, `maintenance` = Erhalt.
// Phasen sind nicht-überlappend; eine offene Phase hat endDate = null.
export const phaseKinds = ["bulk", "cut", "maintenance"] as const;
export type PhaseKind = (typeof phaseKinds)[number];

export const phaseSources = ["manual", "sheets"] as const;
export type PhaseSource = (typeof phaseSources)[number];

export const weightPhases = sqliteTable("weight_phases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: phaseKinds }).notNull(),
  // ISO-Date YYYY-MM-DD
  startDate: text("start_date").notNull().unique(),
  endDate: text("end_date"),
  label: text("label"),
  source: text("source", { enum: phaseSources }).notNull().default("manual"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type WeightPhase = typeof weightPhases.$inferSelect;
export type NewWeightPhase = typeof weightPhases.$inferInsert;
