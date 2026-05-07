import { asc, desc, eq } from "drizzle-orm";
import { db } from "./index";
import { type NewWeightEntry, type WeightEntry, weightEntries } from "./schema";

// Liefert alle Einträge in chronologischer Reihenfolge (älteste zuerst).
// Für Diagramme und Trendberechnungen.
export function getAllWeightEntries(): WeightEntry[] {
  return db.select().from(weightEntries).orderBy(asc(weightEntries.date)).all();
}

// Liefert die n neuesten Einträge (Tabelle, Aktuelles Gewicht).
export function getRecentWeightEntries(limit = 10): WeightEntry[] {
  return db
    .select()
    .from(weightEntries)
    .orderBy(desc(weightEntries.date))
    .limit(limit)
    .all();
}

// Upsert: Pro Datum existiert nur ein Eintrag. Erneutes Speichern überschreibt.
export function upsertWeightEntry(entry: NewWeightEntry): WeightEntry {
  return db
    .insert(weightEntries)
    .values(entry)
    .onConflictDoUpdate({
      target: weightEntries.date,
      set: {
        weightKg: entry.weightKg,
        notes: entry.notes,
        source: entry.source ?? "manual",
      },
    })
    .returning()
    .get();
}

export function deleteWeightEntry(id: number): void {
  db.delete(weightEntries).where(eq(weightEntries.id, id)).run();
}

export function clearAllWeightEntries(): void {
  db.delete(weightEntries).run();
}
