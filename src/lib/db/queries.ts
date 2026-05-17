import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "./index";
import {
  type ActivitySource,
  dailyActivity,
  type DailyActivity,
  exercises,
  type Exercise,
  garminTokens,
  type GarminTokens,
  type NewDailyActivity,
  type NewNutritionEntry,
  type NewSessionExerciseOverride,
  type NewWeightEntry,
  type NewWeightPhase,
  type NewWorkoutSession,
  type NewWorkoutSet,
  type NutritionEntry,
  type NutritionSource,
  nutritionEntries,
  sessionExerciseOverrides,
  type SessionExerciseOverride,
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
export async function getAllWeightEntries(): Promise<WeightEntry[]> {
  return db.select().from(weightEntries).orderBy(asc(weightEntries.date)).all();
}

// Liefert die n neuesten Einträge (Tabelle, Aktuelles Gewicht).
export async function getRecentWeightEntries(limit = 10): Promise<WeightEntry[]> {
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

export async function getWeightEntryByDate(
  date: string,
): Promise<WeightEntry | undefined> {
  return db
    .select()
    .from(weightEntries)
    .where(eq(weightEntries.date, date))
    .get();
}

// Upsert: Pro Datum existiert nur ein Eintrag.
// Felder, die NICHT im Input gesetzt sind (undefined), werden bei einem Konflikt
// NICHT überschrieben — so können Sync-Pfade (z.B. Sheets) das Gewicht
// updaten, ohne manuell gepflegte Tags (cheatDay/alcohol) oder Notizen
// zu verlieren.
export async function upsertWeightEntry(
  entry: NewWeightEntry,
): Promise<WeightEntry> {
  const set: Record<string, unknown> = {
    weightKg: entry.weightKg,
    source: entry.source ?? "manual",
  };
  if (entry.notes !== undefined) set.notes = entry.notes;
  if (entry.cheatDay !== undefined) set.cheatDay = entry.cheatDay;
  if (entry.alcohol !== undefined) set.alcohol = entry.alcohol;
  if (entry.cheatMeal !== undefined) set.cheatMeal = entry.cheatMeal;
  if (entry.kcalTarget !== undefined) set.kcalTarget = entry.kcalTarget;
  const [row] = await db
    .insert(weightEntries)
    .values(entry)
    .onConflictDoUpdate({
      target: weightEntries.date,
      set,
    })
    .returning();
  return row;
}

// Aktualisiert nur die Tagesmetadaten (notes, source, cheatDay, alcohol).
// Der Eintrag muss bereits existieren — sonst no-op.
export async function updateWeightMetadata(
  date: string,
  patch: Partial<
    Pick<
      WeightEntry,
      "notes" | "source" | "cheatDay" | "alcohol" | "cheatMeal" | "kcalTarget"
    >
  >,
): Promise<WeightEntry | undefined> {
  const [row] = await db
    .update(weightEntries)
    .set(patch)
    .where(eq(weightEntries.date, date))
    .returning();
  return row;
}

export async function deleteWeightEntry(id: number): Promise<void> {
  await db.delete(weightEntries).where(eq(weightEntries.id, id)).run();
}

export async function deleteWeightEntryByDate(date: string): Promise<void> {
  await db.delete(weightEntries).where(eq(weightEntries.date, date)).run();
}

export async function clearAllWeightEntries(): Promise<void> {
  await db.delete(weightEntries).run();
}

// ---- Phasen ----

export async function getAllPhases(): Promise<WeightPhase[]> {
  return db
    .select()
    .from(weightPhases)
    .orderBy(asc(weightPhases.startDate))
    .all();
}

export async function upsertPhase(phase: NewWeightPhase): Promise<WeightPhase> {
  const [row] = await db
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
    .returning();
  return row;
}

export async function deletePhase(id: number): Promise<void> {
  await db.delete(weightPhases).where(eq(weightPhases.id, id)).run();
}

export async function clearAllPhases(): Promise<void> {
  await db.delete(weightPhases).run();
}

// ============================================================
// Hypertrophy
// ============================================================

export type TemplateExerciseRow = {
  templateExercise: WorkoutTemplateExercise;
  exercise: Exercise;
};

export async function getAllTemplates(): Promise<WorkoutTemplate[]> {
  return db
    .select()
    .from(workoutTemplates)
    .orderBy(asc(workoutTemplates.id))
    .all();
}

export async function getTemplateBySlug(
  slug: string,
): Promise<WorkoutTemplate | undefined> {
  return db
    .select()
    .from(workoutTemplates)
    .where(eq(workoutTemplates.slug, slug))
    .get();
}

export async function getTemplateByKind(
  kind: WorkoutKind,
): Promise<WorkoutTemplate | undefined> {
  return db
    .select()
    .from(workoutTemplates)
    .where(eq(workoutTemplates.kind, kind))
    .get();
}

// Übungen eines Templates in der definierten Reihenfolge, inkl. Stammdaten.
export async function getTemplateExercises(
  templateId: number,
): Promise<TemplateExerciseRow[]> {
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

export async function getExerciseBySlug(
  slug: string,
): Promise<Exercise | undefined> {
  return db.select().from(exercises).where(eq(exercises.slug, slug)).get();
}

// Liefert das Template-Exercise + Übungs-Stammdaten für ein (Template-Slug, Übungs-Slug)-Paar.
export async function getTemplateExerciseBySlug(
  templateId: number,
  exerciseSlug: string,
): Promise<TemplateExerciseRow | undefined> {
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
export async function getSessionsByTemplate(
  templateId: number,
): Promise<WorkoutSession[]> {
  return db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.templateId, templateId))
    .orderBy(desc(workoutSessions.date))
    .all();
}

// Alle Sessions über alle Templates (für Kalender-Overview).
export async function getAllSessions(): Promise<WorkoutSession[]> {
  return db
    .select()
    .from(workoutSessions)
    .orderBy(desc(workoutSessions.date))
    .all();
}

export async function getSession(
  templateId: number,
  date: string,
): Promise<WorkoutSession | undefined> {
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

export async function getSessionById(
  id: number,
): Promise<WorkoutSession | undefined> {
  return db.select().from(workoutSessions).where(eq(workoutSessions.id, id)).get();
}

export async function createSession(
  input: NewWorkoutSession,
): Promise<WorkoutSession> {
  const [row] = await db.insert(workoutSessions).values(input).returning();
  return row;
}

export async function deleteSession(id: number): Promise<void> {
  await db.delete(workoutSessions).where(eq(workoutSessions.id, id)).run();
}

export async function updateSessionNotes(
  id: number,
  notes: string | null,
): Promise<WorkoutSession | undefined> {
  const [row] = await db
    .update(workoutSessions)
    .set({ notes })
    .where(eq(workoutSessions.id, id))
    .returning();
  return row;
}

// Sets einer Session, gruppiert per template_exercise + set_number.
export async function getSetsBySession(sessionId: number): Promise<WorkoutSet[]> {
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

export async function getSetsByTemplateExercise(
  templateExerciseId: number,
): Promise<SetWithDate[]> {
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
export async function upsertSet(input: NewWorkoutSet): Promise<WorkoutSet> {
  const [row] = await db
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
    .returning();
  return row;
}

export async function getSetById(id: number): Promise<WorkoutSet | undefined> {
  return db.select().from(workoutSets).where(eq(workoutSets.id, id)).get();
}

export async function updateSetWeightMode(
  id: number,
  mode: "per-side" | "summed",
): Promise<WorkoutSet | undefined> {
  const [row] = await db
    .update(workoutSets)
    .set({ weightMode: mode })
    .where(eq(workoutSets.id, id))
    .returning();
  return row;
}

export async function deleteSet(id: number): Promise<void> {
  await db.delete(workoutSets).where(eq(workoutSets.id, id)).run();
}

// ---- Session-Exercise-Overrides ----

export async function getOverridesForSession(
  sessionId: number,
): Promise<SessionExerciseOverride[]> {
  return db
    .select()
    .from(sessionExerciseOverrides)
    .where(eq(sessionExerciseOverrides.sessionId, sessionId))
    .all();
}

export async function upsertSessionExerciseOverride(
  input: NewSessionExerciseOverride,
): Promise<SessionExerciseOverride> {
  const [row] = await db
    .insert(sessionExerciseOverrides)
    .values(input)
    .onConflictDoUpdate({
      target: [
        sessionExerciseOverrides.sessionId,
        sessionExerciseOverrides.templateExerciseId,
      ],
      set: { name: input.name },
    })
    .returning();
  return row;
}

export async function deleteSessionExerciseOverride(
  sessionId: number,
  templateExerciseId: number,
): Promise<void> {
  await db
    .delete(sessionExerciseOverrides)
    .where(
      and(
        eq(sessionExerciseOverrides.sessionId, sessionId),
        eq(sessionExerciseOverrides.templateExerciseId, templateExerciseId),
      ),
    )
    .run();
}

// ---- Progress-Indikator: Vorheriges Training pro Übungs-Slot ----

export type PreviousSetEntry = {
  setNumber: number;
  weightKg: number;
  reps: number;
};

export type PreviousSessionSets = {
  date: string;
  sessionId: number;
  overrideName: string | null;
  sets: PreviousSetEntry[];
};

// Liefert die Sätze aus der jüngsten Session VOR `excludeSessionId`, in der
// dieser Slot tatsächlich geloggte Sätze hat (reps > 0). Pro Satz-Nummer
// wird der jeweils höchste Gewichts-Eintrag genommen (typischerweise eh nur einer).
// Der Override-Name jener Session kommt mit, damit der Caller filtern kann
// (Vergleich nur bei gleicher Übung).
export async function getPreviousSessionSetsForSlot(
  templateExerciseId: number,
  excludeSessionId: number,
  beforeDate: string,
): Promise<PreviousSessionSets | null> {
  // Kandidaten-Sessions: jüngste zuerst.
  const candidateSessions = await db
    .selectDistinct({
      sessionId: workoutSets.sessionId,
      date: workoutSessions.date,
    })
    .from(workoutSets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutSets.sessionId))
    .where(
      and(
        eq(workoutSets.templateExerciseId, templateExerciseId),
        sql`${workoutSessions.id} <> ${excludeSessionId}`,
        sql`${workoutSessions.date} <= ${beforeDate}`,
      ),
    )
    .orderBy(desc(workoutSessions.date))
    .all();

  for (const cand of candidateSessions) {
    const sets = await db
      .select({
        setNumber: workoutSets.setNumber,
        weightKg: workoutSets.weightKg,
        reps: workoutSets.reps,
      })
      .from(workoutSets)
      .where(
        and(
          eq(workoutSets.sessionId, cand.sessionId),
          eq(workoutSets.templateExerciseId, templateExerciseId),
          sql`${workoutSets.reps} > 0`,
        ),
      )
      .orderBy(asc(workoutSets.setNumber))
      .all();
    if (sets.length === 0) continue;

    const override = await db
      .select()
      .from(sessionExerciseOverrides)
      .where(
        and(
          eq(sessionExerciseOverrides.sessionId, cand.sessionId),
          eq(sessionExerciseOverrides.templateExerciseId, templateExerciseId),
        ),
      )
      .get();

    return {
      date: cand.date,
      sessionId: cand.sessionId,
      overrideName: override?.name ?? null,
      sets,
    };
  }
  return null;
}

export async function getSessionByGarminId(
  garminActivityId: number,
): Promise<WorkoutSession | undefined> {
  return db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.garminActivityId, garminActivityId))
    .get();
}

// Liefert für jeden Übungs-Slug + Alias eine Lookup-Map: alias → exercise_id.
// Wird einmal pro Sync gebaut, Lookup ist O(1) pro Garmin-Code.
export async function buildExerciseAliasMap(): Promise<Map<string, number>> {
  const all = await db.select().from(exercises).all();
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

// ============================================================
// Nutrition
// ============================================================

export async function getNutritionEntries(opts?: {
  from?: string;
  to?: string;
  source?: NutritionSource;
}): Promise<NutritionEntry[]> {
  const conds = [] as ReturnType<typeof eq>[];
  if (opts?.from) conds.push(gte(nutritionEntries.date, opts.from));
  if (opts?.to) conds.push(lte(nutritionEntries.date, opts.to));
  if (opts?.source) conds.push(eq(nutritionEntries.source, opts.source));
  const where = conds.length > 0 ? and(...conds) : undefined;
  const q = db.select().from(nutritionEntries);
  return (where ? q.where(where) : q).orderBy(asc(nutritionEntries.date)).all();
}

export async function getNutritionForDate(
  date: string,
  source: NutritionSource = "fddb",
): Promise<NutritionEntry | undefined> {
  return db
    .select()
    .from(nutritionEntries)
    .where(
      and(
        eq(nutritionEntries.date, date),
        eq(nutritionEntries.source, source),
      ),
    )
    .get();
}

// Upsert pro (date, source). Bei Konflikt werden alle Werte aktualisiert
// und `updated_at` neu gesetzt — die Quelle ist hier authoritativ.
export async function upsertNutritionEntry(
  entry: NewNutritionEntry,
): Promise<NutritionEntry> {
  const [row] = await db
    .insert(nutritionEntries)
    .values(entry)
    .onConflictDoUpdate({
      target: [nutritionEntries.date, nutritionEntries.source],
      set: {
        caloriesKcal: entry.caloriesKcal,
        proteinG: entry.proteinG,
        carbsG: entry.carbsG,
        fatG: entry.fatG,
        fiberG: entry.fiberG ?? null,
        sugarG: entry.sugarG ?? null,
        rawJson: entry.rawJson ?? null,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      },
    })
    .returning();
  return row;
}

// ============================================================
// Daily Activity (Garmin total kcal burned)
// ============================================================

export async function getDailyActivityEntries(opts?: {
  from?: string;
  to?: string;
  source?: ActivitySource;
}): Promise<DailyActivity[]> {
  const conds = [] as ReturnType<typeof eq>[];
  if (opts?.from) conds.push(gte(dailyActivity.date, opts.from));
  if (opts?.to) conds.push(lte(dailyActivity.date, opts.to));
  if (opts?.source) conds.push(eq(dailyActivity.source, opts.source));
  const where = conds.length > 0 ? and(...conds) : undefined;
  const q = db.select().from(dailyActivity);
  return (where ? q.where(where) : q).orderBy(asc(dailyActivity.date)).all();
}

export async function getDailyActivityForDate(
  date: string,
  source: ActivitySource = "garmin",
): Promise<DailyActivity | undefined> {
  return db
    .select()
    .from(dailyActivity)
    .where(
      and(eq(dailyActivity.date, date), eq(dailyActivity.source, source)),
    )
    .get();
}

export async function upsertDailyActivity(
  entry: NewDailyActivity,
): Promise<DailyActivity> {
  const [row] = await db
    .insert(dailyActivity)
    .values(entry)
    .onConflictDoUpdate({
      target: [dailyActivity.date, dailyActivity.source],
      set: {
        totalKcal: entry.totalKcal,
        activeKcal: entry.activeKcal ?? null,
        bmrKcal: entry.bmrKcal ?? null,
        steps: entry.steps ?? null,
        rawJson: entry.rawJson ?? null,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      },
    })
    .returning();
  return row;
}

// ============================================================
// Garmin OAuth-Tokens
// ============================================================

export async function getGarminTokens(): Promise<GarminTokens | undefined> {
  return db.select().from(garminTokens).where(eq(garminTokens.id, 1)).get();
}

export async function saveGarminTokens(
  oauth1Json: string,
  oauth2Json: string,
): Promise<void> {
  await db
    .insert(garminTokens)
    .values({ id: 1, oauth1Json, oauth2Json })
    .onConflictDoUpdate({
      target: garminTokens.id,
      set: {
        oauth1Json,
        oauth2Json,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      },
    })
    .run();
}

// Cycle-Nummer = wievielte Ausführung dieses Templates (chronologisch).
// Berechnet in einer Query: alle Sessions des Templates, deren Datum ≤ ist.
export async function cycleNumberFor(
  templateId: number,
  date: string,
): Promise<number> {
  const row = await db
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
