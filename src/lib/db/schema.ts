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
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

// Tag-Metadaten pro Datum — bewusst getrennt von weight_entries, damit
// (a) Tags auch an Tagen ohne Gewicht existieren können und (b) die
// Tag-Übersicht auf /weight/tags nicht durch den Weight-Eintrag „versteckt"
// wird. Single Source of Truth für cheatDay, alcohol, cheatMeal, kcalTarget.
export const dailyTags = sqliteTable("daily_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(),
  cheatDay: integer("cheat_day", { mode: "boolean" }).notNull().default(false),
  alcohol: integer("alcohol", { mode: "boolean" }).notNull().default(false),
  // Cheat Meal: einzelnes Meal getauscht/nicht getrackt, aber im Kalorienziel
  // geblieben — fddb-Wert wird im Chart durch das Tagesziel ersetzt.
  cheatMeal: integer("cheat_meal", { mode: "boolean" }).notNull().default(false),
  // Tagesziel in kcal — manuell pro Tag pflegbar (für Cheat-Meal-Tage).
  kcalTarget: integer("kcal_target"),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type DailyTag = typeof dailyTags.$inferSelect;
export type NewDailyTag = typeof dailyTags.$inferInsert;

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

// Workout-Typen — die drei Original-Einheiten. `kind` ist seit Migration 0018
// kein fixer Enum mehr (beliebige Einheiten erlaubt, neue setzen kind = slug);
// diese Konstante bleibt als Legacy-Typ für das Garmin-Strength-Mapping
// (garmin-strength-import.ts) und die Fallback-Visuals in workouts.ts.
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

// Trainingseinheiten ("Workout-Vorlagen"). Seit Migration 0018 dynamisch:
// beliebig viele Einheiten, jede mit eigenen Visuals (color/letter), einer
// Rotation (in_rotation + sort_order) und einem Archiv-Flag (ausgeblendet,
// Historie bleibt erhalten — workout_sessions.templateId ist ON DELETE RESTRICT).
export const workoutTemplates = sqliteTable("workout_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  // Früher fixer Enum + unique. Jetzt freies Textfeld (weiterhin unique):
  // die 3 Originale behalten ihren Wert (Garmin-Mapping), neue Einheiten
  // setzen kind = slug.
  kind: text("kind").notNull().unique(),
  name: text("name").notNull(),
  // UI-Visuals pro Einheit (Palette-Key, z. B. "indigo"; Marker-Buchstabe).
  // Null bei Alt-Daten → Fallback über workoutKinds-Maps in workouts.ts.
  color: text("color"),
  letter: text("letter"),
  // Rotation: aktuell aktive Einheiten + Reihenfolge.
  inRotation: integer("in_rotation", { mode: "boolean" })
    .notNull()
    .default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
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

// ============================================================
// Endurance: Eine Zeile pro Lauf-Activity aus Garmin. Idempotent via
// `garmin_activity_id` (UNIQUE). Mehrere Läufe pro Tag möglich, deshalb
// kein UNIQUE auf `date`. Pace wird zur Schreib-Zeit aus duration/distance
// abgeleitet, damit Range-Queries nicht jedes Mal rechnen müssen.
// ============================================================
export const runActivityTypes = [
  "running",
  "treadmill_running",
  "trail_running",
  "indoor_running",
  "track_running",
] as const;
export type RunActivityType = (typeof runActivityTypes)[number];

export const runSessions = sqliteTable(
  "run_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    garminActivityId: integer("garmin_activity_id"),
    // ISO-Date YYYY-MM-DD (lokaler Tag, abgeleitet aus startTimeLocal).
    date: text("date").notNull(),
    // ISO-Datetime (Garmin liefert lokale Zeit ohne Offset).
    startTime: text("start_time").notNull(),
    activityType: text("activity_type").notNull(),
    distanceMeters: real("distance_meters").notNull(),
    durationSeconds: real("duration_seconds").notNull(),
    avgPaceSecPerKm: real("avg_pace_sec_per_km"),
    avgHeartRate: integer("avg_heart_rate"),
    maxHeartRate: integer("max_heart_rate"),
    elevationGainMeters: real("elevation_gain_meters"),
    caloriesKcal: real("calories_kcal"),
    aerobicTrainingEffect: real("aerobic_training_effect"),
    anaerobicTrainingEffect: real("anaerobic_training_effect"),
    trainingLoad: real("training_load"),
    vo2MaxRun: real("vo2_max_run"),
    notes: text("notes"),
    rawJson: text("raw_json"),
    // Per-Lap-Zusammenfassung aus Garmin (Splits). Erlaubt der KI, einen
    // gleichmäßigen Recovery-Lauf von einem strukturierten Workout (Intervalle,
    // Tempowechsel) zu unterscheiden. null = noch nicht (nach-)synct.
    lapsJson: text("laps_json", { mode: "json" }).$type<RunLap[] | null>(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex("run_session_garmin_activity_unique").on(table.garminActivityId),
    check("distance_non_negative", sql`${table.distanceMeters} >= 0`),
    check("duration_non_negative", sql`${table.durationSeconds} >= 0`),
  ],
);

// Eine Runde/ein Split eines Laufs (aus Garmin laps). Reicht der KI, um
// Pace-Varianz (Intervalle) von gleichmäßigem Tempo (Recovery) zu erkennen.
export type RunLap = {
  distanceMeters: number;
  durationSec: number;
  avgPaceSecPerKm: number | null;
  avgHr: number | null;
};

export type RunSession = typeof runSessions.$inferSelect;
export type NewRunSession = typeof runSessions.$inferInsert;

// ============================================================
// Garmin Daily Metrics — Tagesschnappschuss der Longevity- (RHR, HRV, Sleep)
// und Performance-Werte (VO2 Max, Race Predictions, Training Status,
// Lactate Threshold). Eine Zeile pro Tag (UNIQUE auf `date`), idempotent
// upsertbar. Felder sind alle nullable — Garmin liefert nicht jeden Wert
// jeden Tag.
// ============================================================
export const garminDailyMetrics = sqliteTable(
  "garmin_daily_metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull().unique(),
    restingHeartRate: integer("resting_heart_rate"),
    hrvLastNight: integer("hrv_last_night"),
    hrvStatus: text("hrv_status"),
    sleepScore: integer("sleep_score"),
    sleepDurationSec: integer("sleep_duration_sec"),
    // Schlaf-Stadien in Sekunden — für das Balkendiagramm im Sleep-Popover.
    deepSleepSec: integer("deep_sleep_sec"),
    lightSleepSec: integer("light_sleep_sec"),
    remSleepSec: integer("rem_sleep_sec"),
    awakeSleepSec: integer("awake_sleep_sec"),
    // ISO-Datetime des Sleep-Start/End (lokal) — für Schlafens-/Aufstehzeit.
    sleepStartLocal: text("sleep_start_local"),
    sleepEndLocal: text("sleep_end_local"),
    // Garmin's freitextiges Quality-Feedback ("Good", "Poor", "Excellent", …).
    sleepQuality: text("sleep_quality"),
    // HRV-Baseline-Korridor (Garmin liefert das im hrvSummary.baseline).
    // "balanced"-Bereich liegt zwischen balancedLow und balancedUpper.
    hrvBaselineLowUpper: real("hrv_baseline_low_upper"),
    hrvBaselineBalancedLow: real("hrv_baseline_balanced_low"),
    hrvBaselineBalancedUpper: real("hrv_baseline_balanced_upper"),
    hrvBaselineMarker: real("hrv_baseline_marker"),
    // RHR 7-Tage-Durchschnitt (kommt direkt aus Garmin getHeartRate response).
    restingHeartRate7dAvg: integer("resting_heart_rate_7d_avg"),
    vo2MaxRunning: real("vo2_max_running"),
    lactateThresholdHr: integer("lactate_threshold_hr"),
    lactateThresholdPaceSecPerKm: real("lactate_threshold_pace_sec_per_km"),
    trainingStatus: text("training_status"),
    racePrediction5k: integer("race_prediction_5k"),
    racePrediction10k: integer("race_prediction_10k"),
    racePredictionHalfMarathon: integer("race_prediction_half_marathon"),
    racePredictionMarathon: integer("race_prediction_marathon"),
    rawJson: text("raw_json"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
);

export type GarminDailyMetrics = typeof garminDailyMetrics.$inferSelect;
export type NewGarminDailyMetrics = typeof garminDailyMetrics.$inferInsert;

// ============================================================
// Endurance Phase 4 — Training Plans
//
// Modell:
//   training_plans (1) ──< training_plan_weeks (n)
//   training_plans (1) ──< training_plan_sessions (n)
//   training_plan_sessions (1) ──< training_plan_blocks (n)
//   training_plan_sessions.alternativeOfId → training_plan_sessions.id (self-FK)
//
// Eine Session = ein Slot an einem Tag. Die "Option 2" aus dem Referenzplan
// wird als eigene Session-Zeile mit `alternativeOfId = primarySessionId`
// gespeichert — so kann sie eigene Blocks haben, separat editiert und im
// Detail-View angeboten werden.
//
// Strukturierte Intervalle leben in `training_plan_blocks.segmentsJson` als
// JSON-Array. Das hält das Schema flexibel für alle Intervall-Muster aus dem
// Referenzplan (simple Läufe, n×Wdh, Progressionen, Criss-Cross, Mixed Long Run).
// ============================================================

export const trainingPlanGoalTypes = ["race", "general"] as const;
export type TrainingPlanGoalType = (typeof trainingPlanGoalTypes)[number];

export const trainingPlanStatuses = ["draft", "active", "completed", "archived"] as const;
export type TrainingPlanStatus = (typeof trainingPlanStatuses)[number];

export const trainingPlanPhases = ["base", "build", "peak", "taper", "race"] as const;
export type TrainingPlanPhase = (typeof trainingPlanPhases)[number];

// Bewusst auf sechs Kern-Typen reduziert (Sprint 4.1). Die KI bildet die
// Sessions einer Referenz auf genau diese Typen ab — keine Freitext-Vielfalt.
// "rest" gibt es NICHT: Ruhetage bleiben einfach leer (keine Session-Zeile).
export const trainingPlanSessionTypes = [
  "recovery",
  "easy",
  "tempo",
  "threshold",
  "vo2max",
  "long",
] as const;
export type TrainingPlanSessionType = (typeof trainingPlanSessionTypes)[number];

export const trainingPlanSessionStatuses = [
  "planned",
  "completed",
  "skipped",
  "modified",
] as const;
export type TrainingPlanSessionStatus =
  (typeof trainingPlanSessionStatuses)[number];

// Eine Trainingsphase = ein Plan. Aktuell ein aktiver Plan zur Zeit gedacht
// (status="active"), Phase 1 = BMW Berlin Marathon 27.9.26 Sub-3.
// Pace-Zonen werden als JSON gespeichert (5 Zonen je min/max Pace), damit
// sie pro Plan individuell sein können. `referencePdfText` ist der extrahierte
// Volltext aus der hochgeladenen Referenz-PDF (Option c: kein File-Storage).
export const trainingPlans = sqliteTable(
  "training_plans",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    goalType: text("goal_type", { enum: trainingPlanGoalTypes })
      .notNull()
      .default("race"),
    raceName: text("race_name"),
    // ISO-Date YYYY-MM-DD. Plan rechnet rückwärts von hier.
    raceDate: text("race_date"),
    raceDistanceKm: real("race_distance_km"),
    // Zielzeit in Sekunden (z.B. 10800 = 3:00:00).
    targetTimeSeconds: integer("target_time_seconds"),
    // Ziel-Pace in Sekunden pro Kilometer (z.B. 255 = 4:15/km).
    targetPaceSecPerKm: real("target_pace_sec_per_km"),
    // Peak-Wochenvolumen (Regler in der Goal-Race-Plan-Card).
    targetWeeklyKmPeak: real("target_weekly_km_peak"),
    sessionsPerWeek: integer("sessions_per_week"),
    // Berechnet aus raceDate - totalWeeks*7, explizit gespeichert für schnelle Queries.
    planStartDate: text("plan_start_date").notNull(),
    totalWeeks: integer("total_weeks").notNull(),
    status: text("status", { enum: trainingPlanStatuses })
      .notNull()
      .default("draft"),
    // Pace-Zonen als JSON, Struktur:
    //   { z1: { minSec, maxSec }, z2: {…}, z3: {…}, z4: {…}, z5: {…} }
    // Sec = Sekunden pro Kilometer.
    paceZonesJson: text("pace_zones_json", { mode: "json" }).$type<{
      z1: { minSec: number; maxSec: number };
      z2: { minSec: number; maxSec: number };
      z3: { minSec: number; maxSec: number };
      z4: { minSec: number; maxSec: number };
      z5: { minSec: number; maxSec: number };
    } | null>(),
    // Extrahierter Volltext aus der hochgeladenen Referenz-PDF.
    // Fallback, wenn keine native Datei vorliegt (Alt-Pläne).
    referencePdfText: text("reference_pdf_text"),
    referencePdfName: text("reference_pdf_name"),
    // Sprint 4.1: Referenzdatei (PDF oder Bild) base64-kodiert, damit sie
    // bei der KI-Generierung NATIV an Claude (Vision) übergeben werden kann
    // — statt verlustbehaftet zu Text extrahiert. Serverless-konform (kein FS).
    referenceFileBase64: text("reference_file_base64"),
    referenceFileMediaType: text("reference_file_media_type"),
    notes: text("notes"),
    // #10: KI-generierte Tagesnotiz zur NÄCHSTEN Session — leitet aus aktuellen
    // Health-Daten (HRV/Schlaf/Recovery) eine kurze, tagesaktuelle Empfehlung
    // ab. Wird vom täglichen Cron und vom Sync-Button aktualisiert.
    nextNoteText: text("next_note_text"),
    // Datum der Session, auf die sich die Notiz bezieht — damit wir erkennen,
    // ob die Notiz noch zur aktuell nächsten Session passt (sonst veraltet).
    nextNoteForDate: text("next_note_for_date"),
    nextNoteGeneratedAt: text("next_note_generated_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    check("total_weeks_positive", sql`${table.totalWeeks} >= 1`),
    check(
      "target_pace_non_negative",
      sql`${table.targetPaceSecPerKm} IS NULL OR ${table.targetPaceSecPerKm} >= 0`,
    ),
  ],
);

export type TrainingPlan = typeof trainingPlans.$inferSelect;
export type NewTrainingPlan = typeof trainingPlans.$inferInsert;

// Eine Zeile pro Trainingswoche. weekNumber zählt von 1 (Plan-Start) bis
// totalWeeks (Race-Woche). Phase ist die Periodisierungs-Phase, die der
// Nutzer in der Goal-Race-Plan-Card definiert (KI darf NICHT periodisieren).
export const trainingPlanWeeks = sqliteTable(
  "training_plan_weeks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planId: integer("plan_id")
      .notNull()
      .references(() => trainingPlans.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    // ISO-Date Montag der Woche.
    startDate: text("start_date").notNull(),
    // ISO-Date Sonntag der Woche.
    endDate: text("end_date").notNull(),
    phase: text("phase", { enum: trainingPlanPhases }).notNull(),
    // Ziel-Wochenvolumen in km (optional; Regler oder KI-Empfehlung).
    targetVolumeKm: real("target_volume_km"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex("plan_week_unique").on(table.planId, table.weekNumber),
    check("week_number_positive", sql`${table.weekNumber} >= 1`),
  ],
);

export type TrainingPlanWeek = typeof trainingPlanWeeks.$inferSelect;
export type NewTrainingPlanWeek = typeof trainingPlanWeeks.$inferInsert;

// Eine Trainingseinheit. Mehrere Sessions pro Tag möglich (Double-Days);
// `dayOrder` regelt die Reihenfolge.
// `alternativeOfId` zeigt auf eine andere Session: ist es gesetzt, ist DIESE
// Zeile die Alternative ("Option 2") zur Primär-Session.
// `runSessionId` verlinkt zum tatsächlich absolvierten Garmin-Lauf (S5/S6).
// `aiLocked` = true → KI darf diese Session NICHT mehr anfassen.
export const trainingPlanSessions = sqliteTable(
  "training_plan_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planId: integer("plan_id")
      .notNull()
      .references(() => trainingPlans.id, { onDelete: "cascade" }),
    weekId: integer("week_id")
      .notNull()
      .references(() => trainingPlanWeeks.id, { onDelete: "cascade" }),
    // ISO-Date YYYY-MM-DD.
    date: text("date").notNull(),
    dayOrder: integer("day_order").notNull().default(1),
    sessionType: text("session_type", { enum: trainingPlanSessionTypes }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    // Ziel-Dauer in Sekunden über alle Blocks (vereinfacht Filter/Statistiken).
    targetDurationSec: integer("target_duration_sec"),
    targetDistanceMeters: real("target_distance_meters"),
    // Dominante Pace-Zone (1..5). Für Charts/Filter — Detail steht in Blocks.
    primaryZone: integer("primary_zone"),
    status: text("status", { enum: trainingPlanSessionStatuses })
      .notNull()
      .default("planned"),
    aiLocked: integer("ai_locked", { mode: "boolean" }).notNull().default(false),
    // Self-FK: wenn gesetzt, ist DIES eine Alternative zu der referenzierten Session.
    alternativeOfId: integer("alternative_of_id"),
    // Welche Variante hat der Nutzer/die KI zuletzt gewählt? Nur auf der Primär-
    // Session relevant (auf der Alternative ist es typischerweise NULL).
    selectedAlternativeId: integer("selected_alternative_id"),
    // Verlinkt zur absolvierten Garmin-Activity, sobald der Lauf gemacht ist.
    runSessionId: integer("run_session_id").references(() => runSessions.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex("plan_session_date_order_unique").on(
      table.planId,
      table.date,
      table.dayOrder,
      table.alternativeOfId,
    ),
    check("day_order_positive", sql`${table.dayOrder} >= 1`),
    check(
      "primary_zone_range",
      sql`${table.primaryZone} IS NULL OR (${table.primaryZone} >= 1 AND ${table.primaryZone} <= 5)`,
    ),
  ],
);

export type TrainingPlanSession = typeof trainingPlanSessions.$inferSelect;
export type NewTrainingPlanSession = typeof trainingPlanSessions.$inferInsert;

// Strukturierte Intervalle einer Session.
// `repetitions` = wie oft wird das Block-Muster wiederholt (z.B. 3 für "3×12min Z3").
// `segmentsJson` = JSON-Array von Sub-Segmenten innerhalb einer Wiederholung,
// jedes mit Art (work/recovery/warmup/cooldown), Dauer/Distanz, Zone, Pace, HF.
//
// Beispiele:
//  - "60 min Z1-2"            → 1 Block, reps=1, segments=[{kind:"work", durationSec:3600, zoneMin:1, zoneMax:2}]
//  - "3×12 min Z3, 3 min rec" → 1 Block, reps=3, segments=[{kind:"work",720,z3},{kind:"recovery",180,z1}]
//  - "15min Z2 → 15min Z3"    → 2 Blocks, reps=1, je 1 segment
//  - "6×6 min Z3/Z4 alt"      → 1 Block, reps=6, segments=[{kind:"work",180,z3},{kind:"work",180,z4}]
export type TrainingPlanBlockSegmentKind =
  | "warmup"
  | "work"
  | "recovery"
  | "cooldown";

export type TrainingPlanBlockSegment = {
  kind: TrainingPlanBlockSegmentKind;
  durationSec?: number;
  distanceMeters?: number;
  // Eine fixe Zone (1..5) oder eine Range (z.B. Z1-Z2 = {min:1, max:2}).
  zone?: number;
  zoneMin?: number;
  zoneMax?: number;
  // Optional explizite Pace-Range (Sekunden pro Kilometer).
  paceMinSec?: number;
  paceMaxSec?: number;
  // Optional explizite HR-Range (bpm).
  hrMin?: number;
  hrMax?: number;
  description?: string;
};

export const trainingPlanBlocks = sqliteTable(
  "training_plan_blocks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => trainingPlanSessions.id, { onDelete: "cascade" }),
    blockOrder: integer("block_order").notNull(),
    repetitions: integer("repetitions").notNull().default(1),
    segmentsJson: text("segments_json", { mode: "json" })
      .$type<TrainingPlanBlockSegment[]>()
      .notNull(),
    description: text("description"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex("block_session_order_unique").on(
      table.sessionId,
      table.blockOrder,
    ),
    check("repetitions_positive", sql`${table.repetitions} >= 1`),
    check("block_order_positive", sql`${table.blockOrder} >= 1`),
  ],
);

export type TrainingPlanBlock = typeof trainingPlanBlocks.$inferSelect;
export type NewTrainingPlanBlock = typeof trainingPlanBlocks.$inferInsert;

// =============================================================
// Dashboard — tägliche KI-Overview für die Startseite.
// Eine Zeile pro Tag (UNIQUE auf date) mit je einem kurzen Bewertungs-Text
// pro Modul. Wird vom Cron nach den Syncs generiert; fehlt die Zeile beim
// Seitenaufruf, generiert die Startseite sie selbst nach (Self-Heal).
// =============================================================

export const dashboardOverviews = sqliteTable("dashboard_overviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(), // YYYY-MM-DD
  enduranceText: text("endurance_text").notNull(),
  hypertrophyText: text("hypertrophy_text").notNull(),
  weightText: text("weight_text").notNull(),
  // Modell-ID, mit der generiert wurde (Debug/Nachvollziehbarkeit).
  model: text("model"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type DashboardOverview = typeof dashboardOverviews.$inferSelect;
export type NewDashboardOverview = typeof dashboardOverviews.$inferInsert;

// =============================================================
// Auth (Better Auth) — user/session/account/verification.
// Generiert via `npx @better-auth/cli generate`, lebt in auth-schema.ts.
// =============================================================

export * from "./auth-schema";
