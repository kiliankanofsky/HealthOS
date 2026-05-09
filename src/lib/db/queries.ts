import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "./index";
import {
  exercises,
  type Exercise,
  type NewWeightEntry,
  type NewWeightPhase,
  type NewWorkoutSession,
  type NewWorkoutSet,
  type WeightEntry,
  type WeightPhase,
  type WorkoutKind,
  type WorkoutSession,
  type WorkoutSet,
  type WorkoutTemplate,
  type WorkoutTemplateExercise,
  weightEntries,
  weightPhases,
  workoutSessions,
  workoutSets,
  workoutTemplateExercises,
  workoutTemplates,
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

// Liefert das Datum des Vortags im YYYY-MM-DD Format. UTC-sicher.
export function previousDayIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

// ============================================================
// Hypertrophy
// ============================================================

export type TemplateExerciseRow = {
  templateExercise: WorkoutTemplateExercise;
  exercise: Exercise;
};

export function getAllTemplates(): WorkoutTemplate[] {
  return db
    .select()
    .from(workoutTemplates)
    .orderBy(asc(workoutTemplates.id))
    .all();
}

export function getTemplateBySlug(slug: string): WorkoutTemplate | undefined {
  return db
    .select()
    .from(workoutTemplates)
    .where(eq(workoutTemplates.slug, slug))
    .get();
}

export function getTemplateByKind(
  kind: WorkoutKind,
): WorkoutTemplate | undefined {
  return db
    .select()
    .from(workoutTemplates)
    .where(eq(workoutTemplates.kind, kind))
    .get();
}

// Übungen eines Templates in der definierten Reihenfolge, inkl. Stammdaten.
export function getTemplateExercises(
  templateId: number,
): TemplateExerciseRow[] {
  return db
    .select({
      templateExercise: workoutTemplateExercises,
      exercise: exercises,
    })
    .from(workoutTemplateExercises)
    .innerJoin(exercises, eq(exercises.id, workoutTemplateExercises.exerciseId))
    .where(eq(workoutTemplateExercises.templateId, templateId))
    .orderBy(asc(workoutTemplateExercises.position))
    .all();
}

export function getExerciseBySlug(slug: string): Exercise | undefined {
  return db.select().from(exercises).where(eq(exercises.slug, slug)).get();
}

// Liefert das Template-Exercise + Übungs-Stammdaten für ein (Template-Slug, Übungs-Slug)-Paar.
export function getTemplateExerciseBySlug(
  templateId: number,
  exerciseSlug: string,
): TemplateExerciseRow | undefined {
  return db
    .select({
      templateExercise: workoutTemplateExercises,
      exercise: exercises,
    })
    .from(workoutTemplateExercises)
    .innerJoin(exercises, eq(exercises.id, workoutTemplateExercises.exerciseId))
    .where(
      and(
        eq(workoutTemplateExercises.templateId, templateId),
        eq(exercises.slug, exerciseSlug),
      ),
    )
    .get();
}

// Sessions für ein Template, neueste zuerst — für Listen und Cycle-Counting.
export function getSessionsByTemplate(templateId: number): WorkoutSession[] {
  return db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.templateId, templateId))
    .orderBy(desc(workoutSessions.date))
    .all();
}

// Alle Sessions über alle Templates (für Kalender-Overview).
export function getAllSessions(): WorkoutSession[] {
  return db
    .select()
    .from(workoutSessions)
    .orderBy(desc(workoutSessions.date))
    .all();
}

export function getSession(
  templateId: number,
  date: string,
): WorkoutSession | undefined {
  return db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.templateId, templateId),
        eq(workoutSessions.date, date),
      ),
    )
    .get();
}

export function getSessionById(id: number): WorkoutSession | undefined {
  return db.select().from(workoutSessions).where(eq(workoutSessions.id, id)).get();
}

export function createSession(input: NewWorkoutSession): WorkoutSession {
  return db.insert(workoutSessions).values(input).returning().get();
}

export function deleteSession(id: number): void {
  db.delete(workoutSessions).where(eq(workoutSessions.id, id)).run();
}

export function updateSessionNotes(
  id: number,
  notes: string | null,
): WorkoutSession | undefined {
  return db
    .update(workoutSessions)
    .set({ notes })
    .where(eq(workoutSessions.id, id))
    .returning()
    .get();
}

// Sets einer Session, gruppiert per template_exercise + set_number.
export function getSetsBySession(sessionId: number): WorkoutSet[] {
  return db
    .select()
    .from(workoutSets)
    .where(eq(workoutSets.sessionId, sessionId))
    .orderBy(asc(workoutSets.templateExerciseId), asc(workoutSets.setNumber))
    .all();
}

// Alle Sets einer Übung über alle Sessions hinweg (für Per-Übung-Chart).
// Gibt Sätze inkl. zugehörigem Datum zurück.
export type SetWithDate = WorkoutSet & { date: string };

export function getSetsByTemplateExercise(
  templateExerciseId: number,
): SetWithDate[] {
  return db
    .select({
      id: workoutSets.id,
      sessionId: workoutSets.sessionId,
      templateExerciseId: workoutSets.templateExerciseId,
      setNumber: workoutSets.setNumber,
      weightKg: workoutSets.weightKg,
      reps: workoutSets.reps,
      weightMode: workoutSets.weightMode,
      restSeconds: workoutSets.restSeconds,
      notes: workoutSets.notes,
      createdAt: workoutSets.createdAt,
      date: workoutSessions.date,
    })
    .from(workoutSets)
    .innerJoin(
      workoutSessions,
      eq(workoutSessions.id, workoutSets.sessionId),
    )
    .where(eq(workoutSets.templateExerciseId, templateExerciseId))
    .orderBy(asc(workoutSessions.date), asc(workoutSets.setNumber))
    .all();
}

// Upsert eines Satzes anhand (sessionId, templateExerciseId, setNumber).
export function upsertSet(input: NewWorkoutSet): WorkoutSet {
  return db
    .insert(workoutSets)
    .values(input)
    .onConflictDoUpdate({
      target: [
        workoutSets.sessionId,
        workoutSets.templateExerciseId,
        workoutSets.setNumber,
      ],
      set: {
        weightKg: input.weightKg,
        reps: input.reps,
        weightMode: input.weightMode ?? "per-side",
        restSeconds: input.restSeconds ?? null,
        notes: input.notes ?? null,
      },
    })
    .returning()
    .get();
}

export function getSetById(id: number): WorkoutSet | undefined {
  return db.select().from(workoutSets).where(eq(workoutSets.id, id)).get();
}

export function updateSetWeightMode(
  id: number,
  mode: "per-side" | "summed",
): WorkoutSet | undefined {
  return db
    .update(workoutSets)
    .set({ weightMode: mode })
    .where(eq(workoutSets.id, id))
    .returning()
    .get();
}

export function deleteSet(id: number): void {
  db.delete(workoutSets).where(eq(workoutSets.id, id)).run();
}

export function getSessionByGarminId(
  garminActivityId: number,
): WorkoutSession | undefined {
  return db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.garminActivityId, garminActivityId))
    .get();
}

// Liefert für jeden Übungs-Slug + Alias eine Lookup-Map: alias → exercise_id.
// Wird einmal pro Sync gebaut, Lookup ist O(1) pro Garmin-Code.
export function buildExerciseAliasMap(): Map<string, number> {
  const all = db.select().from(exercises).all();
  const map = new Map<string, number>();
  for (const ex of all) {
    map.set(ex.slug.toLowerCase(), ex.id);
    map.set(ex.name.toLowerCase(), ex.id);
    if (ex.garminName) map.set(ex.garminName.toLowerCase(), ex.id);
    for (const alias of ex.aliases ?? []) {
      map.set(alias.toLowerCase(), ex.id);
    }
  }
  return map;
}

// Cycle-Nummer = wievielte Ausführung dieses Templates (chronologisch).
// Berechnet in einer Query: alle Sessions des Templates, deren Datum ≤ ist.
export function cycleNumberFor(
  templateId: number,
  date: string,
): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.templateId, templateId),
        sql`${workoutSessions.date} <= ${date}`,
      ),
    )
    .get();
  return Number(row?.count ?? 0);
}
