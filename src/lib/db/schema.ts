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
  // Cheat Meal: einzelnes Meal getauscht/nicht getrackt, aber im Kalorienziel
  // geblieben — fddb-Wert für den Tag wird beim Charten durch das Tagesziel
  // ersetzt.
  cheatMeal: integer("cheat_meal", { mode: "boolean" }).notNull().default(false),
  // Tagesziel in kcal — manuell pro Tag pflegbar. Wird für die Aufgenommen-
  // Linie bei einem Cheat-Meal-Tag eingesetzt.
  kcalTarget: integer("kcal_target"),
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

// Pro Session kann ein Übungs-Slot durch eine alternative Übung ersetzt werden
// (z.B. weil das Gerät besetzt war). Sätze werden weiter unter der ursprünglichen
// templateExerciseId geloggt — der Override liefert nur einen anderen Anzeige-Namen,
// damit die Historie für Statistiken konsistent bleibt und der Slot eindeutig ist.
export const sessionExerciseOverrides = sqliteTable(
  "session_exercise_overrides",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    templateExerciseId: integer("template_exercise_id")
      .notNull()
      .references(() => workoutTemplateExercises.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex("override_session_exercise_unique").on(
      table.sessionId,
      table.templateExerciseId,
    ),
  ],
);

export type SessionExerciseOverride = typeof sessionExerciseOverrides.$inferSelect;
export type NewSessionExerciseOverride =
  typeof sessionExerciseOverrides.$inferInsert;

// ============================================================
// Nutrition: Tagessummen aus externen Trackern (fddb, später ggf. YAZIO /
// Apple Health). Eine Zeile pro Tag pro Quelle — `source` ist Teil der
// Eindeutigkeit, damit beim Quellen-Wechsel keine Daten überschrieben werden.
// ============================================================

export const nutritionSources = ["fddb", "yazio", "apple-health", "manual"] as const;
export type NutritionSource = (typeof nutritionSources)[number];

export const nutritionEntries = sqliteTable(
  "nutrition_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // ISO-Date YYYY-MM-DD
    date: text("date").notNull(),
    source: text("source", { enum: nutritionSources })
      .notNull()
      .default("fddb"),
    caloriesKcal: integer("calories_kcal").notNull(),
    proteinG: real("protein_g").notNull(),
    carbsG: real("carbs_g").notNull(),
    fatG: real("fat_g").notNull(),
    fiberG: real("fiber_g"),
    sugarG: real("sugar_g"),
    // Roh-Antwort der Quelle (z.B. fddb-HTML-Snippet oder JSON) für
    // Debugging und späteres Re-Parsing ohne erneuten Netz-Request.
    rawJson: text("raw_json"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex("nutrition_date_source_unique").on(table.date, table.source),
    check("calories_non_negative", sql`${table.caloriesKcal} >= 0`),
    check("protein_non_negative", sql`${table.proteinG} >= 0`),
    check("carbs_non_negative", sql`${table.carbsG} >= 0`),
    check("fat_non_negative", sql`${table.fatG} >= 0`),
  ],
);

export type NutritionEntry = typeof nutritionEntries.$inferSelect;
export type NewNutritionEntry = typeof nutritionEntries.$inferInsert;

// ============================================================
// Daily Activity: Garmins „Total Calories burned" pro Tag — Summe aus BMR
// + Aktivität (Workouts + Steps + NEAT). Bewusst getrennt von
// nutrition_entries, da das eine Output- (Verbrauch) und das andere
// Input-Daten (Aufnahme) sind.
// ============================================================

export const activitySources = ["garmin", "manual"] as const;
export type ActivitySource = (typeof activitySources)[number];

export const dailyActivity = sqliteTable(
  "daily_activity",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    source: text("source", { enum: activitySources })
      .notNull()
      .default("garmin"),
    // BMR + Aktivität — die Zahl, die Garmin als "Total" anzeigt.
    totalKcal: integer("total_kcal").notNull(),
    // Nur Aktivität (Workouts + Steps + NEAT).
    activeKcal: integer("active_kcal"),
    // Reine BMR-Komponente (Ruheumsatz).
    bmrKcal: integer("bmr_kcal"),
    steps: integer("steps"),
    rawJson: text("raw_json"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex("activity_date_source_unique").on(table.date, table.source),
    check("total_kcal_non_negative", sql`${table.totalKcal} >= 0`),
  ],
);

export type DailyActivity = typeof dailyActivity.$inferSelect;
export type NewDailyActivity = typeof dailyActivity.$inferInsert;

// ============================================================
// Garmin OAuth-Tokens — eine einzelne Zeile (id=1) statt File-Cache.
// Auf Vercel (serverless) gibt es kein persistentes Filesystem; deshalb
// wandern die Tokens in die DB, damit der Cron-Sync sie zwischen Runs
// behalten kann.
// ============================================================
export const garminTokens = sqliteTable("garmin_tokens", {
  id: integer("id").primaryKey(),
  oauth1Json: text("oauth1_json").notNull(),
  oauth2Json: text("oauth2_json").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type GarminTokens = typeof garminTokens.$inferSelect;
export type NewGarminTokens = typeof garminTokens.$inferInsert;
