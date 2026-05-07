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
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type WeightEntry = typeof weightEntries.$inferSelect;
export type NewWeightEntry = typeof weightEntries.$inferInsert;
