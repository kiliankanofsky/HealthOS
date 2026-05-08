import { asc, desc, eq } from "drizzle-orm";
import { db } from "./index";
import {
  type NewWeightEntry,
  type NewWeightPhase,
  type WeightEntry,
  type WeightPhase,
  weightEntries,
  weightPhases,
} from "./schema";

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

export function getWeightEntryByDate(date: string): WeightEntry | undefined {
  return db
    .select()
    .from(weightEntries)
    .where(eq(weightEntries.date, date))
    .get();
}

// Upsert: Pro Datum existiert nur ein Eintrag. Erneutes Speichern überschreibt
// die schreibbaren Felder (weight, source, notes, cheat, alcohol).
export function upsertWeightEntry(entry: NewWeightEntry): WeightEntry {
  return db
    .insert(weightEntries)
    .values(entry)
    .onConflictDoUpdate({
      target: weightEntries.date,
      set: {
        weightKg: entry.weightKg,
        notes: entry.notes ?? null,
        source: entry.source ?? "manual",
        cheatDay: entry.cheatDay ?? false,
        alcohol: entry.alcohol ?? false,
      },
    })
    .returning()
    .get();
}

// Aktualisiert nur die Tagesmetadaten (notes, source, cheatDay, alcohol).
// Der Eintrag muss bereits existieren — sonst no-op.
export function updateWeightMetadata(
  date: string,
  patch: Partial<Pick<WeightEntry, "notes" | "source" | "cheatDay" | "alcohol">>,
): WeightEntry | undefined {
  return db
    .update(weightEntries)
    .set(patch)
    .where(eq(weightEntries.date, date))
    .returning()
    .get();
}

export function deleteWeightEntry(id: number): void {
  db.delete(weightEntries).where(eq(weightEntries.id, id)).run();
}

export function deleteWeightEntryByDate(date: string): void {
  db.delete(weightEntries).where(eq(weightEntries.date, date)).run();
}

export function clearAllWeightEntries(): void {
  db.delete(weightEntries).run();
}

// ---- Phasen ----

export function getAllPhases(): WeightPhase[] {
  return db
    .select()
    .from(weightPhases)
    .orderBy(asc(weightPhases.startDate))
    .all();
}

export function upsertPhase(phase: NewWeightPhase): WeightPhase {
  return db
    .insert(weightPhases)
    .values(phase)
    .onConflictDoUpdate({
      target: weightPhases.startDate,
      set: {
        kind: phase.kind,
        endDate: phase.endDate ?? null,
        label: phase.label ?? null,
        source: phase.source ?? "manual",
      },
    })
    .returning()
    .get();
}

export function deletePhase(id: number): void {
  db.delete(weightPhases).where(eq(weightPhases.id, id)).run();
}

export function clearAllPhases(): void {
  db.delete(weightPhases).run();
}
