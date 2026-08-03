// Spielt den Demo-Datensatz (lib/demo/dataset.ts) in die Demo-Datenbank ein.
//
// Läuft NIE gegen die echte DB: `getDemoDb()` liefert einen eigenen Client
// auf TURSO_DEMO_DATABASE_URL (bzw. lokal data/demo.db).

import { desc } from "drizzle-orm";

import { getDemoDb, type HealthDb } from "@/lib/db";
import {
  dailyActivity,
  dailyTags,
  dashboardOverviews,
  exercises,
  garminDailyMetrics,
  nutritionEntries,
  runSessions,
  sessionExerciseOverrides,
  trainingPlanBlocks,
  trainingPlans,
  trainingPlanSessions,
  trainingPlanWeeks,
  weightEntries,
  weightPhases,
  workoutSessions,
  workoutSets,
  workoutTemplateExercises,
  workoutTemplates,
} from "@/lib/db/schema";
import { todayBerlinISO } from "@/lib/utils/date";

import { buildDemoDataset } from "./dataset";

// SQLite verträgt ~32k gebundene Parameter pro Statement — in 100er-Blöcken
// bleiben wir mit Abstand darunter und halten die Turso-Roundtrips klein.
const CHUNK = 100;

async function insertChunked<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await insert(rows.slice(i, i + CHUNK));
  }
}

/**
 * Anker der aktuell eingespielten Demo-Daten (= das „heute", auf das sie
 * gerechnet wurden). null, wenn noch nie geseedet wurde.
 */
export async function demoDataAnchor(db: HealthDb = getDemoDb()): Promise<string | null> {
  const row = await db
    .select({ date: dashboardOverviews.date })
    .from(dashboardOverviews)
    .orderBy(desc(dashboardOverviews.date))
    .limit(1)
    .get();
  return row?.date ?? null;
}

// Verhindert, dass zwei gleichzeitige Erst-Besucher denselben Seed doppelt
// fahren (greift pro Lambda-Instanz — für eine Demo ausreichend).
let inFlight: Promise<void> | null = null;

/**
 * Stellt sicher, dass die Demo-Daten auf „heute" gerechnet sind. Im Normalfall
 * kostet das genau eine SELECT-Abfrage.
 */
export async function ensureDemoDataFresh(): Promise<void> {
  const today = todayBerlinISO();
  const db = getDemoDb();

  if ((await demoDataAnchor(db)) === today) return;

  if (!inFlight) {
    inFlight = seedDemoDatabase(today)
      .then(() => undefined)
      .finally(() => {
        inFlight = null;
      });
  }
  await inFlight;
}

/** Baut die Demo-DB komplett neu auf. */
export async function seedDemoDatabase(
  todayIso: string = todayBerlinISO(),
): Promise<{ tables: number; rows: number }> {
  const db = getDemoDb();
  const data = buildDemoDataset(todayIso);

  // ---- Alles löschen (umgekehrte FK-Reihenfolge) --------------------------
  await db.delete(trainingPlanBlocks);
  await db.delete(trainingPlanSessions);
  await db.delete(trainingPlanWeeks);
  await db.delete(trainingPlans);
  await db.delete(sessionExerciseOverrides);
  await db.delete(workoutSets);
  await db.delete(workoutSessions);
  await db.delete(workoutTemplateExercises);
  await db.delete(workoutTemplates);
  await db.delete(exercises);
  await db.delete(dashboardOverviews);
  await db.delete(garminDailyMetrics);
  await db.delete(runSessions);
  await db.delete(dailyActivity);
  await db.delete(nutritionEntries);
  await db.delete(dailyTags);
  await db.delete(weightPhases);
  await db.delete(weightEntries);

  let rows = 0;

  // ---- Übungen + Templates ------------------------------------------------
  const exerciseIds = new Map<string, number>();
  const insertedExercises = await db
    .insert(exercises)
    .values(
      data.exercises.map((e) => ({
        slug: e.slug,
        name: e.name,
        primaryMuscles: e.primaryMuscles,
        secondaryMuscles: e.secondaryMuscles,
        defaultRepMin: e.defaultRepMin,
        defaultRepMax: e.defaultRepMax,
        unilateral: e.unilateral,
      })),
    )
    .returning({ id: exercises.id, slug: exercises.slug });
  for (const row of insertedExercises) exerciseIds.set(row.slug, row.id);
  rows += insertedExercises.length;

  const templateIds = new Map<string, number>();
  const insertedTemplates = await db
    .insert(workoutTemplates)
    .values(
      data.templates.map((t) => ({
        slug: t.slug,
        kind: t.slug,
        name: t.name,
        color: t.color,
        letter: t.letter,
        sortOrder: t.sortOrder,
        inRotation: true,
        archived: false,
      })),
    )
    .returning({ id: workoutTemplates.id, slug: workoutTemplates.slug });
  for (const row of insertedTemplates) templateIds.set(row.slug, row.id);
  rows += insertedTemplates.length;

  // Slot-Ids brauchen wir gleich für die Sätze: Key = "template/exercise".
  const slotIds = new Map<string, number>();
  const slotRows = data.templates.flatMap((t) =>
    t.exercises.map((slot, index) => ({
      templateId: templateIds.get(t.slug)!,
      exerciseId: exerciseIds.get(slot.slug)!,
      position: index + 1,
      defaultSets: slot.defaultSets,
      key: `${t.slug}/${slot.slug}`,
    })),
  );
  const insertedSlots = await db
    .insert(workoutTemplateExercises)
    .values(
      slotRows.map((s) => ({
        templateId: s.templateId,
        exerciseId: s.exerciseId,
        position: s.position,
        defaultSets: s.defaultSets,
      })),
    )
    .returning({
      id: workoutTemplateExercises.id,
      templateId: workoutTemplateExercises.templateId,
      exerciseId: workoutTemplateExercises.exerciseId,
    });
  for (const row of insertedSlots) {
    const source = slotRows.find(
      (s) => s.templateId === row.templateId && s.exerciseId === row.exerciseId,
    );
    if (source) slotIds.set(source.key, row.id);
  }
  rows += insertedSlots.length;

  // ---- Gym-Sessions + Sätze ----------------------------------------------
  const sessionIds = new Map<string, number>();
  const insertedSessions = await db
    .insert(workoutSessions)
    .values(
      data.workoutSessions.map((s) => ({
        templateId: templateIds.get(s.templateSlug)!,
        date: s.date,
        notes: s.notes,
        source: "manual" as const,
      })),
    )
    .returning({
      id: workoutSessions.id,
      templateId: workoutSessions.templateId,
      date: workoutSessions.date,
    });
  for (const row of insertedSessions) {
    const slug = [...templateIds.entries()].find(([, id]) => id === row.templateId)?.[0];
    if (slug) sessionIds.set(`${slug}/${row.date}`, row.id);
  }
  rows += insertedSessions.length;

  const setRows = data.workoutSets.map((s) => ({
    sessionId: sessionIds.get(`${s.templateSlug}/${s.date}`)!,
    templateExerciseId: slotIds.get(`${s.templateSlug}/${s.exerciseSlug}`)!,
    setNumber: s.setNumber,
    weightKg: s.weightKg,
    reps: s.reps,
    weightMode: s.weightMode,
  }));
  await insertChunked(setRows, (chunk) => db.insert(workoutSets).values(chunk));
  rows += setRows.length;

  if (data.sessionOverrides.length > 0) {
    const overrideRows = data.sessionOverrides.map((o) => ({
      sessionId: sessionIds.get(`${o.templateSlug}/${o.date}`)!,
      templateExerciseId: slotIds.get(`${o.templateSlug}/${o.exerciseSlug}`)!,
      name: o.name,
    }));
    await insertChunked(overrideRows, (chunk) =>
      db.insert(sessionExerciseOverrides).values(chunk),
    );
    rows += overrideRows.length;
  }

  // ---- Gewicht, Phasen, Tags ---------------------------------------------
  await insertChunked(data.weightEntries, (chunk) =>
    db.insert(weightEntries).values(chunk),
  );
  rows += data.weightEntries.length;

  await db.insert(weightPhases).values(data.weightPhases);
  rows += data.weightPhases.length;

  if (data.dailyTags.length > 0) {
    await insertChunked(data.dailyTags, (chunk) => db.insert(dailyTags).values(chunk));
    rows += data.dailyTags.length;
  }

  // ---- Ernährung + Tagesverbrauch ----------------------------------------
  await insertChunked(
    data.nutritionEntries.map((n) => ({ ...n, source: "fddb" as const })),
    (chunk) => db.insert(nutritionEntries).values(chunk),
  );
  rows += data.nutritionEntries.length;

  await insertChunked(
    data.dailyActivity.map((a) => ({ ...a, source: "garmin" as const })),
    (chunk) => db.insert(dailyActivity).values(chunk),
  );
  rows += data.dailyActivity.length;

  // ---- Läufe + Tagesmetriken ---------------------------------------------
  const runIdByDate = new Map<string, number>();
  for (let i = 0; i < data.runSessions.length; i += CHUNK) {
    const inserted = await db
      .insert(runSessions)
      .values(data.runSessions.slice(i, i + CHUNK))
      .returning({ id: runSessions.id, date: runSessions.date });
    for (const row of inserted) runIdByDate.set(row.date, row.id);
  }
  rows += data.runSessions.length;

  await insertChunked(data.dailyMetrics, (chunk) =>
    db.insert(garminDailyMetrics).values(chunk),
  );
  rows += data.dailyMetrics.length;

  // ---- Trainingsplan ------------------------------------------------------
  const [plan] = await db
    .insert(trainingPlans)
    .values(data.trainingPlan)
    .returning({ id: trainingPlans.id });
  rows += 1;

  const weekIds = new Map<number, number>();
  const insertedWeeks = await db
    .insert(trainingPlanWeeks)
    .values(data.planWeeks.map((w) => ({ ...w, planId: plan.id })))
    .returning({ id: trainingPlanWeeks.id, weekNumber: trainingPlanWeeks.weekNumber });
  for (const row of insertedWeeks) weekIds.set(row.weekNumber, row.id);
  rows += insertedWeeks.length;

  const planSessionIdByKey = new Map<string, number>();
  const planSessionRows = data.planSessions.map((s) => ({
    planId: plan.id,
    weekId: weekIds.get(s.weekNumber)!,
    date: s.date,
    dayOrder: s.dayOrder,
    sessionType: s.sessionType,
    title: s.title,
    description: s.description,
    targetDurationSec: s.targetDurationSec,
    targetDistanceMeters: s.targetDistanceMeters,
    primaryZone: s.primaryZone,
    status: s.status,
    // Absolvierte Einheiten zeigen auf den tatsächlichen Lauf desselben Tages.
    runSessionId: s.status === "completed" ? (runIdByDate.get(s.date) ?? null) : null,
  }));
  for (let i = 0; i < planSessionRows.length; i += CHUNK) {
    const inserted = await db
      .insert(trainingPlanSessions)
      .values(planSessionRows.slice(i, i + CHUNK))
      .returning({
        id: trainingPlanSessions.id,
        date: trainingPlanSessions.date,
        dayOrder: trainingPlanSessions.dayOrder,
      });
    for (const row of inserted) planSessionIdByKey.set(`${row.date}/${row.dayOrder}`, row.id);
  }
  rows += planSessionRows.length;

  const blockRows = data.planSessions.flatMap((s) => {
    const sessionId = planSessionIdByKey.get(`${s.date}/${s.dayOrder}`);
    if (!sessionId) return [];
    return s.blocks.map((b) => ({
      sessionId,
      blockOrder: b.blockOrder,
      repetitions: b.repetitions,
      description: b.description,
      segmentsJson: b.segments,
    }));
  });
  await insertChunked(blockRows, (chunk) => db.insert(trainingPlanBlocks).values(chunk));
  rows += blockRows.length;

  // ---- KI-Tagesübersicht (vorgeneriert) + Anker --------------------------
  await db.insert(dashboardOverviews).values(data.dashboardOverview);
  rows += 1;

  return { tables: 18, rows };
}
