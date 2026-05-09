import { sql } from "drizzle-orm";
import {
  check,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

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

// ============================================================
// Hypertrophy: Templates getrennt von Sessions.
// `exercises` und `workout_templates` sind Stammdaten (selten geändert),
// `workout_sessions` + `workout_sets` entstehen pro Trainingseinheit.
// Alles Datums- bzw. Phasenabhängige (Cycle, KW, Phase, Cheat/Alkohol)
// wird zur Laufzeit abgeleitet und hier NICHT gespeichert.
// ============================================================

// Übungs-Quellen: bisher nur manuell, später Garmin-API.
export const exerciseSources = ["manual", "garmin"] as const;
export type ExerciseSource = (typeof exerciseSources)[number];

// Workout-Typen — fixer Katalog (Upper A / Lower / Upper B).
// Erweiterbar, aber im UI als Enum sichtbar.
export const workoutKinds = ["upper-a", "lower", "upper-b"] as const;
export type WorkoutKind = (typeof workoutKinds)[number];

// Stammdaten pro Übung. `garmin_name` und `aliases` (JSON-Array von Strings)
// sind die Brücke zum späteren Garmin-Import.
export const exercises = sqliteTable("exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  garminName: text("garmin_name"),
  // JSON-encodierte string[] — ein Set verschiedener Garmin-Schreibweisen.
  aliases: text("aliases", { mode: "json" }).$type<string[]>(),
  // JSON-encodierte string[] (z.B. ["chest", "front-delts"]).
  primaryMuscles: text("primary_muscles", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  secondaryMuscles: text("secondary_muscles", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`('[]')`),
  defaultRepMin: integer("default_rep_min").notNull(),
  defaultRepMax: integer("default_rep_max").notNull(),
  // Bei einarmigen Übungen tracken wir das summierte Gewicht (beide Seiten),
  // dieser Flag dient nur als UI-Hinweis ("16 kg = beide Arme").
  unilateral: integer("unilateral", { mode: "boolean" })
    .notNull()
    .default(false),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;

// Drei Workout-Vorlagen: Upper A / Lower / Upper B.
export const workoutTemplates = sqliteTable("workout_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  kind: text("kind", { enum: workoutKinds }).notNull().unique(),
  name: text("name").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type WorkoutTemplate = typeof workoutTemplates.$inferSelect;
export type NewWorkoutTemplate = typeof workoutTemplates.$inferInsert;

// Welche Übung steht an Position N in welchem Template.
// Optionale rep_min/rep_max überschreiben die Default-Range der Übung.
export const workoutTemplateExercises = sqliteTable(
  "workout_template_exercises",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    templateId: integer("template_id")
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    repMin: integer("rep_min"),
    repMax: integer("rep_max"),
  },
  (table) => [
    uniqueIndex("template_position_unique").on(table.templateId, table.position),
    uniqueIndex("template_exercise_unique").on(
      table.templateId,
      table.exerciseId,
    ),
  ],
);

export type WorkoutTemplateExercise =
  typeof workoutTemplateExercises.$inferSelect;
export type NewWorkoutTemplateExercise =
  typeof workoutTemplateExercises.$inferInsert;

// Eine konkrete Trainingseinheit. UNIQUE(template_id, date) verhindert
// dasselbe Workout zweimal pro Tag, erlaubt aber Double-Days mit
// verschiedenen Workout-Typen oder einem späteren Lauf-Workout.
export const workoutSessions = sqliteTable(
  "workout_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    templateId: integer("template_id")
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: "restrict" }),
    date: text("date").notNull(),
    notes: text("notes"),
    source: text("source", { enum: exerciseSources })
      .notNull()
      .default("manual"),
    // Garmin-Activity-ID für Idempotenz beim Import. Garmin-IDs sind
    // 64-Bit-Integers (ca. 22799496880).
    garminActivityId: integer("garmin_activity_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex("session_template_date_unique").on(
      table.templateId,
      table.date,
    ),
    uniqueIndex("session_garmin_activity_unique").on(table.garminActivityId),
  ],
);

export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type NewWorkoutSession = typeof workoutSessions.$inferInsert;

// Bei unilateralen Übungen sagt `weight_mode`, ob das geloggte Gewicht
// pro Seite (Default — Hantel-Gewicht pro Arm) oder summiert (beide Seiten
// zusammen) gemeint ist. Bei nicht-unilateralen Übungen ist das Feld
// belanglos und immer "per-side".
export const weightModes = ["per-side", "summed"] as const;
export type WeightMode = (typeof weightModes)[number];

// Einzelne Sätze. reps = 0 ist erlaubt und bedeutet "übersprungen" —
// in Charts wird der Satz dann gefiltert (Lücke), in der Tabelle aber angezeigt.
export const workoutSets = sqliteTable(
  "workout_sets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    templateExerciseId: integer("template_exercise_id")
      .notNull()
      .references(() => workoutTemplateExercises.id, { onDelete: "restrict" }),
    setNumber: integer("set_number").notNull(),
    weightKg: real("weight_kg").notNull(),
    reps: integer("reps").notNull(),
    weightMode: text("weight_mode", { enum: weightModes })
      .notNull()
      .default("per-side"),
    restSeconds: integer("rest_seconds"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex("set_session_exercise_number_unique").on(
      table.sessionId,
      table.templateExerciseId,
      table.setNumber,
    ),
    check("reps_non_negative", sql`${table.reps} >= 0`),
    check("weight_non_negative", sql`${table.weightKg} >= 0`),
    check("set_number_positive", sql`${table.setNumber} >= 1`),
  ],
);

export type WorkoutSet = typeof workoutSets.$inferSelect;
export type NewWorkoutSet = typeof workoutSets.$inferInsert;
