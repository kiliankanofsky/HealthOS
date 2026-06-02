import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "./index";
import {
  type ActivitySource,
  dailyActivity,
  type DailyActivity,
  type DailyTag,
  dailyTags,
  exercises,
  type Exercise,
  garminDailyMetrics,
  type GarminDailyMetrics,
  garminTokens,
  type GarminTokens,
  type NewDailyActivity,
  type NewDailyTag,
  type NewGarminDailyMetrics,
  type NewRunSession,
  type NewNutritionEntry,
  type NewSessionExerciseOverride,
  type NewTrainingPlan,
  type NewTrainingPlanBlock,
  type NewTrainingPlanSession,
  type NewTrainingPlanWeek,
  type NewWeightEntry,
  type NewWeightPhase,
  type NewWorkoutSession,
  type NewWorkoutSet,
  type NutritionEntry,
  type NutritionSource,
  nutritionEntries,
  type RunSession,
  runSessions,
  sessionExerciseOverrides,
  type SessionExerciseOverride,
  type TrainingPlan,
  type TrainingPlanBlock,
  type TrainingPlanSession,
  type TrainingPlanStatus,
  type TrainingPlanWeek,
  trainingPlanBlocks,
  trainingPlanSessions,
  trainingPlanWeeks,
  trainingPlans,
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
// updaten, ohne manuell gepflegte Notizen zu verlieren. Tags wandern jetzt
// in die `daily_tags`-Tabelle (siehe unten).
export async function upsertWeightEntry(
  entry: NewWeightEntry,
): Promise<WeightEntry> {
  const set: Record<string, unknown> = {
    weightKg: entry.weightKg,
    source: entry.source ?? "manual",
  };
  if (entry.notes !== undefined) set.notes = entry.notes;
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

// Aktualisiert nur die Notiz/Quelle eines Weight-Eintrags. Tags wurden in
// `daily_tags` migriert — siehe upsertDailyTag.
export async function updateWeightMetadata(
  date: string,
  patch: Partial<Pick<WeightEntry, "notes" | "source">>,
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

// ---- Daily Tags (cheatDay / alcohol / cheatMeal / kcalTarget) ----
// Bewusst getrennt von weight_entries: ein Tag kann existieren, ohne dass es
// einen Weight-Eintrag gibt. Auch erleichtert die Trennung eine eigene
// /weight/tags-Übersicht.

export async function getAllDailyTags(): Promise<DailyTag[]> {
  return db.select().from(dailyTags).orderBy(asc(dailyTags.date)).all();
}

// Tag-Map nach Datum — für Charts/Kalender, die Tags pro Tag brauchen.
export async function getDailyTagsMap(): Promise<Map<string, DailyTag>> {
  const rows = await getAllDailyTags();
  return new Map(rows.map((r) => [r.date, r]));
}

export async function getDailyTagForDate(
  date: string,
): Promise<DailyTag | undefined> {
  return db.select().from(dailyTags).where(eq(dailyTags.date, date)).get();
}

// Upsert: bestehende Tag-Zeile aktualisieren oder neue anlegen. Undefined-
// Felder werden NICHT überschrieben.
export async function upsertDailyTag(input: NewDailyTag): Promise<DailyTag> {
  const set: Record<string, unknown> = {
    updatedAt: sql`(CURRENT_TIMESTAMP)`,
  };
  if (input.cheatDay !== undefined) set.cheatDay = input.cheatDay;
  if (input.alcohol !== undefined) set.alcohol = input.alcohol;
  if (input.cheatMeal !== undefined) set.cheatMeal = input.cheatMeal;
  if (input.kcalTarget !== undefined) set.kcalTarget = input.kcalTarget;
  if (input.notes !== undefined) set.notes = input.notes;
  const [row] = await db
    .insert(dailyTags)
    .values(input)
    .onConflictDoUpdate({ target: dailyTags.date, set })
    .returning();
  return row;
}

export async function deleteDailyTag(date: string): Promise<void> {
  await db.delete(dailyTags).where(eq(dailyTags.date, date)).run();
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

// ============================================================
// Endurance: Run-Sessions
// ============================================================

export async function getAllRunSessions(): Promise<RunSession[]> {
  return db
    .select()
    .from(runSessions)
    .orderBy(desc(runSessions.startTime))
    .all();
}

export async function getRunSessionsBetween(
  from: string,
  to: string,
): Promise<RunSession[]> {
  return db
    .select()
    .from(runSessions)
    .where(and(gte(runSessions.date, from), lte(runSessions.date, to)))
    .orderBy(asc(runSessions.startTime))
    .all();
}

export async function getRunSessionByDate(
  date: string,
): Promise<RunSession | undefined> {
  return db
    .select()
    .from(runSessions)
    .where(eq(runSessions.date, date))
    .orderBy(desc(runSessions.startTime))
    .get();
}

export async function getRunSessionsForDate(
  date: string,
): Promise<RunSession[]> {
  return db
    .select()
    .from(runSessions)
    .where(eq(runSessions.date, date))
    .orderBy(asc(runSessions.startTime))
    .all();
}

export async function getRunSessionByGarminId(
  garminActivityId: number,
): Promise<RunSession | undefined> {
  return db
    .select()
    .from(runSessions)
    .where(eq(runSessions.garminActivityId, garminActivityId))
    .get();
}

export async function getLatestRunSession(): Promise<RunSession | undefined> {
  return db
    .select()
    .from(runSessions)
    .orderBy(desc(runSessions.startTime))
    .limit(1)
    .get();
}

// Upsert per Garmin-Activity-ID. Manuelle Notizen werden bewahrt (Notes
// werden bei Konflikt NICHT überschrieben) — analog zu upsertWeightEntry.
export async function upsertRunSession(
  input: NewRunSession,
): Promise<RunSession> {
  const [row] = await db
    .insert(runSessions)
    .values(input)
    .onConflictDoUpdate({
      target: runSessions.garminActivityId,
      set: {
        date: input.date,
        startTime: input.startTime,
        activityType: input.activityType,
        distanceMeters: input.distanceMeters,
        durationSeconds: input.durationSeconds,
        avgPaceSecPerKm: input.avgPaceSecPerKm ?? null,
        avgHeartRate: input.avgHeartRate ?? null,
        maxHeartRate: input.maxHeartRate ?? null,
        elevationGainMeters: input.elevationGainMeters ?? null,
        caloriesKcal: input.caloriesKcal ?? null,
        aerobicTrainingEffect: input.aerobicTrainingEffect ?? null,
        anaerobicTrainingEffect: input.anaerobicTrainingEffect ?? null,
        trainingLoad: input.trainingLoad ?? null,
        vo2MaxRun: input.vo2MaxRun ?? null,
        rawJson: input.rawJson ?? null,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      },
    })
    .returning();
  return row;
}

// Liefert pro ISO-Wochenstart (Montag, lokal) die Summe km. Aggregiert
// in SQL, damit die UI nicht alle Runs durchrechnen muss.
export type WeeklyKm = { weekStartIso: string; km: number };

export async function getWeeklyKmTotals(
  fromIso: string,
  toIso: string,
): Promise<WeeklyKm[]> {
  // SQLite: strftime('%w', date) → 0=Sonntag … 6=Samstag. Wir wollen Montag
  // als Wochenstart, also: date('YYYY-MM-DD', '-((weekday+6)%7) days').
  const rows = await db
    .select({
      weekStartIso: sql<string>`date(${runSessions.date}, '-' || ((cast(strftime('%w', ${runSessions.date}) as integer) + 6) % 7) || ' days')`,
      meters: sql<number>`sum(${runSessions.distanceMeters})`,
    })
    .from(runSessions)
    .where(
      and(gte(runSessions.date, fromIso), lte(runSessions.date, toIso)),
    )
    .groupBy(
      sql`date(${runSessions.date}, '-' || ((cast(strftime('%w', ${runSessions.date}) as integer) + 6) % 7) || ' days')`,
    )
    .orderBy(
      sql`date(${runSessions.date}, '-' || ((cast(strftime('%w', ${runSessions.date}) as integer) + 6) % 7) || ' days') asc`,
    )
    .all();
  return rows.map((r) => ({
    weekStartIso: r.weekStartIso,
    km: Number(r.meters ?? 0) / 1000,
  }));
}

// ============================================================
// Endurance: Garmin Daily Metrics
// ============================================================

export async function getDailyMetricsForDate(
  date: string,
): Promise<GarminDailyMetrics | undefined> {
  return db
    .select()
    .from(garminDailyMetrics)
    .where(eq(garminDailyMetrics.date, date))
    .get();
}

export async function getDailyMetricsBetween(
  from: string,
  to: string,
): Promise<GarminDailyMetrics[]> {
  return db
    .select()
    .from(garminDailyMetrics)
    .where(
      and(
        gte(garminDailyMetrics.date, from),
        lte(garminDailyMetrics.date, to),
      ),
    )
    .orderBy(asc(garminDailyMetrics.date))
    .all();
}

export async function getLatestDailyMetrics(): Promise<
  GarminDailyMetrics | undefined
> {
  return db
    .select()
    .from(garminDailyMetrics)
    .orderBy(desc(garminDailyMetrics.date))
    .limit(1)
    .get();
}

export async function upsertDailyMetrics(
  entry: NewGarminDailyMetrics,
): Promise<GarminDailyMetrics> {
  const [row] = await db
    .insert(garminDailyMetrics)
    .values(entry)
    .onConflictDoUpdate({
      target: garminDailyMetrics.date,
      set: {
        restingHeartRate: entry.restingHeartRate ?? null,
        restingHeartRate7dAvg: entry.restingHeartRate7dAvg ?? null,
        hrvLastNight: entry.hrvLastNight ?? null,
        hrvStatus: entry.hrvStatus ?? null,
        hrvBaselineLowUpper: entry.hrvBaselineLowUpper ?? null,
        hrvBaselineBalancedLow: entry.hrvBaselineBalancedLow ?? null,
        hrvBaselineBalancedUpper: entry.hrvBaselineBalancedUpper ?? null,
        hrvBaselineMarker: entry.hrvBaselineMarker ?? null,
        sleepScore: entry.sleepScore ?? null,
        sleepDurationSec: entry.sleepDurationSec ?? null,
        deepSleepSec: entry.deepSleepSec ?? null,
        lightSleepSec: entry.lightSleepSec ?? null,
        remSleepSec: entry.remSleepSec ?? null,
        awakeSleepSec: entry.awakeSleepSec ?? null,
        sleepStartLocal: entry.sleepStartLocal ?? null,
        sleepEndLocal: entry.sleepEndLocal ?? null,
        sleepQuality: entry.sleepQuality ?? null,
        vo2MaxRunning: entry.vo2MaxRunning ?? null,
        lactateThresholdHr: entry.lactateThresholdHr ?? null,
        lactateThresholdPaceSecPerKm:
          entry.lactateThresholdPaceSecPerKm ?? null,
        trainingStatus: entry.trainingStatus ?? null,
        racePrediction5k: entry.racePrediction5k ?? null,
        racePrediction10k: entry.racePrediction10k ?? null,
        racePredictionHalfMarathon: entry.racePredictionHalfMarathon ?? null,
        racePredictionMarathon: entry.racePredictionMarathon ?? null,
        rawJson: entry.rawJson ?? null,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      },
    })
    .returning();
  return row;
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

// ============================================================
// Training Plans (Endurance Phase 4)
// ============================================================

export async function getAllTrainingPlans(): Promise<TrainingPlan[]> {
  return db
    .select()
    .from(trainingPlans)
    .orderBy(desc(trainingPlans.createdAt))
    .all();
}

export async function getTrainingPlanById(
  id: number,
): Promise<TrainingPlan | undefined> {
  return db.select().from(trainingPlans).where(eq(trainingPlans.id, id)).get();
}

// Aktuell aktiver Plan (jüngster mit status="active"). Wir gehen für den
// User von einem aktiven Plan zur Zeit aus.
export async function getActiveTrainingPlan(): Promise<TrainingPlan | undefined> {
  return db
    .select()
    .from(trainingPlans)
    .where(eq(trainingPlans.status, "active"))
    .orderBy(desc(trainingPlans.createdAt))
    .get();
}

// "Aktueller" Plan für die UI: liefert den jüngsten Plan mit status=draft
// ODER active. Wird auf der Goal-Race-Plan-Card genutzt, damit der User seinen
// frisch angelegten (noch Session-losen) Plan sieht, bevor S3 ihn aktiviert.
export async function getCurrentTrainingPlan(): Promise<TrainingPlan | undefined> {
  return db
    .select()
    .from(trainingPlans)
    .where(
      sql`${trainingPlans.status} = 'active' OR ${trainingPlans.status} = 'draft'`,
    )
    .orderBy(desc(trainingPlans.createdAt))
    .get();
}

export async function createTrainingPlan(
  input: NewTrainingPlan,
): Promise<TrainingPlan> {
  const [row] = await db.insert(trainingPlans).values(input).returning();
  return row;
}

export async function updateTrainingPlan(
  id: number,
  patch: Partial<NewTrainingPlan>,
): Promise<TrainingPlan | undefined> {
  const [row] = await db
    .update(trainingPlans)
    .set({ ...patch, updatedAt: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(trainingPlans.id, id))
    .returning();
  return row;
}

export async function setTrainingPlanStatus(
  id: number,
  status: TrainingPlanStatus,
): Promise<TrainingPlan | undefined> {
  return updateTrainingPlan(id, { status });
}

export async function deleteTrainingPlan(id: number): Promise<void> {
  await db.delete(trainingPlans).where(eq(trainingPlans.id, id));
}

// ============================================================
// Training Plan Weeks
// ============================================================

export async function getWeeksForPlan(
  planId: number,
): Promise<TrainingPlanWeek[]> {
  return db
    .select()
    .from(trainingPlanWeeks)
    .where(eq(trainingPlanWeeks.planId, planId))
    .orderBy(asc(trainingPlanWeeks.weekNumber))
    .all();
}

export async function getWeekByNumber(
  planId: number,
  weekNumber: number,
): Promise<TrainingPlanWeek | undefined> {
  return db
    .select()
    .from(trainingPlanWeeks)
    .where(
      and(
        eq(trainingPlanWeeks.planId, planId),
        eq(trainingPlanWeeks.weekNumber, weekNumber),
      ),
    )
    .get();
}

export async function getWeekForDate(
  planId: number,
  date: string,
): Promise<TrainingPlanWeek | undefined> {
  return db
    .select()
    .from(trainingPlanWeeks)
    .where(
      and(
        eq(trainingPlanWeeks.planId, planId),
        lte(trainingPlanWeeks.startDate, date),
        gte(trainingPlanWeeks.endDate, date),
      ),
    )
    .get();
}

export async function createPlanWeek(
  input: NewTrainingPlanWeek,
): Promise<TrainingPlanWeek> {
  const [row] = await db.insert(trainingPlanWeeks).values(input).returning();
  return row;
}

// Bulk-Insert für die initiale Plan-Generierung (16 Wochen in einer Query
// statt 16 sequenzieller Round-Trips — sparen ~1–3s Action-Laufzeit).
export async function insertPlanWeeks(
  weeks: NewTrainingPlanWeek[],
): Promise<TrainingPlanWeek[]> {
  if (weeks.length === 0) return [];
  return db.insert(trainingPlanWeeks).values(weeks).returning().all();
}

export async function updatePlanWeek(
  id: number,
  patch: Partial<NewTrainingPlanWeek>,
): Promise<TrainingPlanWeek | undefined> {
  const [row] = await db
    .update(trainingPlanWeeks)
    .set(patch)
    .where(eq(trainingPlanWeeks.id, id))
    .returning();
  return row;
}

// ============================================================
// Training Plan Sessions
//
// Konvention: "primary" Sessions sind die, wo alternativeOfId NULL ist.
// "alternatives" hängen mit alternativeOfId an einer primary Session.
// ============================================================

// Alle primary Sessions eines Plans, chronologisch.
export async function getSessionsForPlan(
  planId: number,
): Promise<TrainingPlanSession[]> {
  return db
    .select()
    .from(trainingPlanSessions)
    .where(
      and(
        eq(trainingPlanSessions.planId, planId),
        isNull(trainingPlanSessions.alternativeOfId),
      ),
    )
    .orderBy(asc(trainingPlanSessions.date), asc(trainingPlanSessions.dayOrder))
    .all();
}

// Sessions einer einzelnen Woche (primary only).
export async function getPlanSessionsForWeek(
  weekId: number,
): Promise<TrainingPlanSession[]> {
  return db
    .select()
    .from(trainingPlanSessions)
    .where(
      and(
        eq(trainingPlanSessions.weekId, weekId),
        isNull(trainingPlanSessions.alternativeOfId),
      ),
    )
    .orderBy(asc(trainingPlanSessions.date), asc(trainingPlanSessions.dayOrder))
    .all();
}

// Für den Kalender: Sessions in einem Datumsbereich (primary only).
export async function getPlanSessionsForDateRange(
  planId: number,
  fromIso: string,
  toIso: string,
): Promise<TrainingPlanSession[]> {
  return db
    .select()
    .from(trainingPlanSessions)
    .where(
      and(
        eq(trainingPlanSessions.planId, planId),
        gte(trainingPlanSessions.date, fromIso),
        lte(trainingPlanSessions.date, toIso),
        isNull(trainingPlanSessions.alternativeOfId),
      ),
    )
    .orderBy(asc(trainingPlanSessions.date), asc(trainingPlanSessions.dayOrder))
    .all();
}

export async function getPlanSessionById(
  id: number,
): Promise<TrainingPlanSession | undefined> {
  return db
    .select()
    .from(trainingPlanSessions)
    .where(eq(trainingPlanSessions.id, id))
    .get();
}

// Die anstehende nächste Session ab heute (für die "Nächste Session"-Card).
// Nur primary Sessions; nur status="planned".
export async function getNextPlanSession(
  planId: number,
  todayIso: string,
): Promise<TrainingPlanSession | undefined> {
  return db
    .select()
    .from(trainingPlanSessions)
    .where(
      and(
        eq(trainingPlanSessions.planId, planId),
        gte(trainingPlanSessions.date, todayIso),
        eq(trainingPlanSessions.status, "planned"),
        isNull(trainingPlanSessions.alternativeOfId),
      ),
    )
    .orderBy(asc(trainingPlanSessions.date), asc(trainingPlanSessions.dayOrder))
    .get();
}

// Alle Alternativen ("Option 2") einer Primär-Session.
export async function getAlternativesForPlanSession(
  primarySessionId: number,
): Promise<TrainingPlanSession[]> {
  return db
    .select()
    .from(trainingPlanSessions)
    .where(eq(trainingPlanSessions.alternativeOfId, primarySessionId))
    .orderBy(asc(trainingPlanSessions.id))
    .all();
}

export async function createPlanSession(
  input: NewTrainingPlanSession,
): Promise<TrainingPlanSession> {
  const [row] = await db.insert(trainingPlanSessions).values(input).returning();
  return row;
}

// Bulk-Insert für die KI-Plan-Generierung in Sprint 3 — eine Query für alle
// primary Sessions eines Chunks (statt N Round-Trips, wichtig für Turso-Latenz).
export async function insertPlanSessions(
  sessions: NewTrainingPlanSession[],
): Promise<TrainingPlanSession[]> {
  if (sessions.length === 0) return [];
  return db.insert(trainingPlanSessions).values(sessions).returning().all();
}

export async function updatePlanSession(
  id: number,
  patch: Partial<NewTrainingPlanSession>,
): Promise<TrainingPlanSession | undefined> {
  const [row] = await db
    .update(trainingPlanSessions)
    .set({ ...patch, updatedAt: sql`(CURRENT_TIMESTAMP)` })
    .where(eq(trainingPlanSessions.id, id))
    .returning();
  return row;
}

// Für Drag-and-Drop im Kalender: nur Datum/dayOrder ändern.
export async function updatePlanSessionDate(
  id: number,
  newDate: string,
  dayOrder = 1,
): Promise<TrainingPlanSession | undefined> {
  return updatePlanSession(id, { date: newDate, dayOrder });
}

export async function setPlanSessionAiLocked(
  id: number,
  aiLocked: boolean,
): Promise<TrainingPlanSession | undefined> {
  return updatePlanSession(id, { aiLocked });
}

// Verlinkt eine Plan-Session mit einem absolvierten Garmin-Lauf.
// `status` wird auf "completed" gesetzt.
export async function linkPlanSessionToRun(
  id: number,
  runSessionId: number,
): Promise<TrainingPlanSession | undefined> {
  return updatePlanSession(id, { runSessionId, status: "completed" });
}

export async function deletePlanSession(id: number): Promise<void> {
  await db.delete(trainingPlanSessions).where(eq(trainingPlanSessions.id, id));
}

// Alle Sessions eines Plans löschen — Blocks cascaden via FK ON DELETE CASCADE.
// Wird für Reset-Flow in der KI-Plan-Generierung gebraucht (wenn ein Chunk
// schiefging und der User von vorne anfangen will).
export async function deleteAllPlanSessionsForPlan(
  planId: number,
): Promise<void> {
  await db
    .delete(trainingPlanSessions)
    .where(eq(trainingPlanSessions.planId, planId));
}

// ============================================================
// Training Plan Blocks
// ============================================================

export async function getBlocksForPlanSession(
  sessionId: number,
): Promise<TrainingPlanBlock[]> {
  return db
    .select()
    .from(trainingPlanBlocks)
    .where(eq(trainingPlanBlocks.sessionId, sessionId))
    .orderBy(asc(trainingPlanBlocks.blockOrder))
    .all();
}

export async function createPlanBlock(
  input: NewTrainingPlanBlock,
): Promise<TrainingPlanBlock> {
  const [row] = await db.insert(trainingPlanBlocks).values(input).returning();
  return row;
}

// Bulk-Insert für Blocks (analog insertPlanSessions).
export async function insertPlanBlocks(
  blocks: NewTrainingPlanBlock[],
): Promise<TrainingPlanBlock[]> {
  if (blocks.length === 0) return [];
  return db.insert(trainingPlanBlocks).values(blocks).returning().all();
}

// Atomic-Ersatz: alle Blocks einer Session löschen und neu setzen.
// Wird genutzt, wenn die KI eine Session überarbeitet oder der Nutzer im
// Edit-Dialog die Intervallstruktur ändert.
export async function replacePlanBlocksForSession(
  sessionId: number,
  blocks: Omit<NewTrainingPlanBlock, "sessionId">[],
): Promise<TrainingPlanBlock[]> {
  await db
    .delete(trainingPlanBlocks)
    .where(eq(trainingPlanBlocks.sessionId, sessionId));
  if (blocks.length === 0) return [];
  return db
    .insert(trainingPlanBlocks)
    .values(blocks.map((b) => ({ ...b, sessionId })))
    .returning();
}

export async function deletePlanBlock(id: number): Promise<void> {
  await db.delete(trainingPlanBlocks).where(eq(trainingPlanBlocks.id, id));
}
