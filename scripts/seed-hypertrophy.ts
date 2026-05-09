import { eq, sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  exercises,
  workoutTemplateExercises,
  workoutTemplates,
} from "../src/lib/db/schema";

// Idempotenter Seed: legt Übungs-Stammdaten + die drei Workout-Templates
// (Upper A / Lower / Upper B) inkl. Übungs-Reihenfolge an.
// Bei wiederholtem Lauf werden Übungen per Slug aktualisiert (Upsert).

type ExerciseSeed = {
  slug: string;
  name: string;
  garminName: string | null;
  aliases?: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  defaultRepMin: number;
  defaultRepMax: number;
  unilateral?: boolean;
  notes?: string;
};

// Stammdaten — exakt 21 Übungen aus deinen drei Workouts.
// Muskelgruppen-Mapping konservativ. `unilateral` markiert Single-Side-Übungen
// (Gewicht wird trotzdem als summierter kg-Wert gespeichert).
const EXERCISES: ExerciseSeed[] = [
  // ----- Upper A -----
  {
    slug: "db-incline-press",
    name: "DB Incline Press",
    garminName: "Schrägbankdrücken mit Kurzhantel",
    aliases: ["INCLINE_DUMBBELL_BENCH_PRESS"],
    primaryMuscles: ["chest-upper"],
    secondaryMuscles: ["front-delt", "triceps"],
    defaultRepMin: 6,
    defaultRepMax: 10,
  },
  {
    slug: "low-row",
    name: "Low Row",
    garminName: "Rudergerät",
    aliases: ["Maschinenrudern", "Sitzendes Rudern", "INDOOR_ROW"],
    primaryMuscles: ["upper-back"],
    secondaryMuscles: ["lats", "biceps", "rear-delt"],
    defaultRepMin: 6,
    defaultRepMax: 10,
  },
  {
    slug: "cable-fly",
    name: "Cable Fly",
    garminName: "Fly mit Band",
    aliases: ["Kabelzug-Fly", "FLY"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front-delt"],
    defaultRepMin: 8,
    defaultRepMax: 12,
  },
  {
    slug: "lat-pulldown",
    name: "Lat Pulldown",
    garminName: "Latziehen",
    aliases: ["LAT_PULLDOWN"],
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps", "mid-back"],
    defaultRepMin: 6,
    defaultRepMax: 10,
  },
  {
    slug: "db-side-lateral-standing",
    name: "Side Lateral (stehend)",
    garminName: "Kurzhantel-Seitheben",
    aliases: ["DUMBBELL_LATERAL_RAISE"],
    primaryMuscles: ["side-delt"],
    secondaryMuscles: [],
    defaultRepMin: 8,
    defaultRepMax: 15,
  },
  {
    slug: "db-preacher-curl-uni",
    name: "DB Preacher Curl (uni)",
    garminName: "Einarmiger Scott-Curl",
    aliases: ["ONE_ARM_PREACHER_CURL"],
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    defaultRepMin: 8,
    defaultRepMax: 15,
    unilateral: true,
    notes: "Gewicht summiert für beide Arme — Garmin loggt 2× Hantel-Gewicht.",
  },
  {
    slug: "ab-machine",
    name: "AB Machine",
    garminName: "Crunch mit Gewichten",
    aliases: ["WEIGHTED_CRUNCH"],
    primaryMuscles: ["abs"],
    secondaryMuscles: [],
    defaultRepMin: 6,
    defaultRepMax: 10,
  },

  // ----- Lower -----
  {
    slug: "bayesian-curl",
    name: "Bayesian Curl",
    garminName: "Kabelzug-Armcurl, einarmig, hinter dem Rücken",
    aliases: ["BEHIND_THE_BACK_ONE_ARM_CABLE_CURL"],
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    defaultRepMin: 6,
    defaultRepMax: 10,
    unilateral: true,
  },
  {
    slug: "back-squat",
    name: "Squat",
    garminName: "Kniebeuge mit Zusatzgewicht",
    aliases: ["Langhantel-Kniebeuge", "WEIGHTED_SQUAT"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["lower-back", "hamstrings"],
    defaultRepMin: 5,
    defaultRepMax: 8,
  },
  {
    slug: "stiff-leg-deadlift",
    name: "Stiff-Leg Deadlift",
    garminName: "Kreuzheben mit Langhantel",
    aliases: ["Rumänisches Kreuzheben", "BARBELL_DEADLIFT"],
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["lower-back"],
    defaultRepMin: 5,
    defaultRepMax: 8,
    notes: "SLDL — Variante des klassischen Kreuzhebens.",
  },
  {
    slug: "bulgarian-split-squat",
    name: "Bulgarian Split Squat",
    garminName: "Bulgarische Split-Kniebeuge mit Kurzhanteln",
    aliases: ["DUMBBELL_BULGARIAN_SPLIT_SQUAT"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings", "calves"],
    defaultRepMin: 5,
    defaultRepMax: 8,
  },
  {
    slug: "hamstring-curl",
    name: "Hamstring Curl",
    garminName: "Beinbeugen mit Zusatzgewicht",
    aliases: ["Beinbeuger", "WEIGHTED_LEG_CURL"],
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: ["calves"],
    defaultRepMin: 6,
    defaultRepMax: 10,
  },
  {
    slug: "leg-extension-uni",
    name: "Leg Extension (uni)",
    garminName: "Beinstrecken mit Zusatzgewicht",
    aliases: ["WEIGHTED_LEG_EXTENSIONS"],
    primaryMuscles: ["quads"],
    secondaryMuscles: [],
    defaultRepMin: 6,
    defaultRepMax: 10,
    unilateral: true,
  },
  {
    slug: "single-leg-rdl",
    name: "Single Leg RDL",
    garminName: "Einbeiniges Rumänisches Kreuzheben mit Kurzhantel",
    aliases: ["SINGLE_LEG_ROMANIAN_DEADLIFT_WITH_DUMBBELL"],
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["lower-back", "core"],
    defaultRepMin: 6,
    defaultRepMax: 10,
    unilateral: true,
  },
  {
    slug: "standing-calf-raise",
    name: "Standing Calf Raise",
    garminName: "Wadenheben",
    aliases: ["CALF_RAISE"],
    primaryMuscles: ["calves"],
    secondaryMuscles: [],
    defaultRepMin: 6,
    defaultRepMax: 10,
    notes: "Garmin sendet hier nur die Kategorie 'CALF_RAISE' ohne detaillierten Übungs-Namen.",
  },
  {
    slug: "overhead-cable-tricep-ext",
    name: "Overhead Cable Tricep Extension",
    garminName: "Kabelzug-Trizeps-Armstrecker Überkopf",
    aliases: ["CABLE_OVERHEAD_TRICEPS_EXTENSION"],
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    defaultRepMin: 6,
    defaultRepMax: 10,
  },

  // ----- Upper B -----
  {
    slug: "cable-pullover",
    name: "Cable Pullover",
    garminName: "Kabelzug-Überzüge stehend",
    aliases: ["STANDING_CABLE_PULLOVER"],
    primaryMuscles: ["lats"],
    secondaryMuscles: ["chest", "triceps"],
    defaultRepMin: 5,
    defaultRepMax: 8,
  },
  {
    slug: "chest-press-machine",
    name: "Chest Press",
    garminName: "Brustpresse mit Schlitten",
    aliases: ["CHEST_PRESS"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front-delt", "triceps"],
    defaultRepMin: 5,
    defaultRepMax: 8,
  },
  {
    slug: "barbell-row",
    name: "Barbell Row",
    garminName: "Aufrechtes Rudern mit Langhantel",
    aliases: ["Langhantelrudern", "BARBELL_UPRIGHT_ROW"],
    primaryMuscles: ["upper-back"],
    secondaryMuscles: ["lats", "biceps", "rear-delt"],
    defaultRepMin: 5,
    defaultRepMax: 8,
    notes: "Im Garmin-Export steht 'Aufrechtes Rudern' — gemeint ist Bent-Over-Row.",
  },
  {
    slug: "machine-fly",
    name: "Machine Fly",
    garminName: "Flys",
    aliases: ["FLYE"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front-delt"],
    defaultRepMin: 8,
    defaultRepMax: 12,
  },
  {
    slug: "cable-side-lateral-uni",
    name: "Cable Side Lateral (uni)",
    garminName: "Einarmiges Seitheben am Kabelzug",
    aliases: ["ONE_ARM_CABLE_LATERAL_RAISE"],
    primaryMuscles: ["side-delt"],
    secondaryMuscles: [],
    defaultRepMin: 8,
    defaultRepMax: 12,
    unilateral: true,
  },
  {
    slug: "machine-rear-delt-fly",
    name: "Machine Rear Delt Fly",
    garminName: "Reverse Fly positiv",
    aliases: ["INCLINE_REVERSE_FLYE"],
    primaryMuscles: ["rear-delt"],
    secondaryMuscles: ["mid-back"],
    defaultRepMin: 6,
    defaultRepMax: 10,
  },
  {
    slug: "cable-pushdown-uni",
    name: "Cable Pushdown (uni)",
    garminName: "Trizepsdrücken",
    aliases: ["TRICEPS_PRESS"],
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    defaultRepMin: 6,
    defaultRepMax: 10,
    unilateral: true,
  },
  {
    slug: "cable-crunch",
    name: "Cable Crunch",
    garminName: "Crunch am Kabelzug",
    aliases: ["CABLE_CRUNCH"],
    primaryMuscles: ["abs"],
    secondaryMuscles: [],
    defaultRepMin: 6,
    defaultRepMax: 10,
  },
];

// Templates + Übungs-Reihenfolge (1-basiert).
type TemplateSeed = {
  slug: string;
  kind: "upper-a" | "lower" | "upper-b";
  name: string;
  exerciseSlugs: string[];
};

const TEMPLATES: TemplateSeed[] = [
  {
    slug: "upper-a",
    kind: "upper-a",
    name: "Upper A",
    exerciseSlugs: [
      "db-incline-press",
      "low-row",
      "cable-fly",
      "lat-pulldown",
      "db-side-lateral-standing",
      "db-preacher-curl-uni",
      "ab-machine",
    ],
  },
  {
    slug: "lower",
    kind: "lower",
    name: "Lower",
    exerciseSlugs: [
      "bayesian-curl",
      "back-squat",
      "stiff-leg-deadlift",
      "bulgarian-split-squat",
      "hamstring-curl",
      "leg-extension-uni",
      "single-leg-rdl",
      "standing-calf-raise",
      "overhead-cable-tricep-ext",
    ],
  },
  {
    slug: "upper-b",
    kind: "upper-b",
    name: "Upper B",
    exerciseSlugs: [
      "cable-pullover",
      "chest-press-machine",
      "barbell-row",
      "machine-fly",
      "cable-side-lateral-uni",
      "machine-rear-delt-fly",
      "cable-pushdown-uni",
      "cable-crunch",
    ],
  },
];

function seedExercises(): Map<string, number> {
  const idBySlug = new Map<string, number>();
  for (const e of EXERCISES) {
    const inserted = db
      .insert(exercises)
      .values({
        slug: e.slug,
        name: e.name,
        garminName: e.garminName,
        aliases: e.aliases ?? null,
        primaryMuscles: e.primaryMuscles,
        secondaryMuscles: e.secondaryMuscles,
        defaultRepMin: e.defaultRepMin,
        defaultRepMax: e.defaultRepMax,
        unilateral: e.unilateral ?? false,
        notes: e.notes ?? null,
      })
      .onConflictDoUpdate({
        target: exercises.slug,
        set: {
          name: e.name,
          garminName: e.garminName,
          aliases: e.aliases ?? null,
          primaryMuscles: e.primaryMuscles,
          secondaryMuscles: e.secondaryMuscles,
          defaultRepMin: e.defaultRepMin,
          defaultRepMax: e.defaultRepMax,
          unilateral: e.unilateral ?? false,
          notes: e.notes ?? null,
        },
      })
      .returning()
      .get();
    idBySlug.set(e.slug, inserted.id);
  }
  return idBySlug;
}

function seedTemplates(exerciseIdBySlug: Map<string, number>) {
  for (const t of TEMPLATES) {
    const tpl = db
      .insert(workoutTemplates)
      .values({ slug: t.slug, kind: t.kind, name: t.name })
      .onConflictDoUpdate({
        target: workoutTemplates.slug,
        set: { kind: t.kind, name: t.name },
      })
      .returning()
      .get();

    // Upsert per (template_id, position): wenn an Position N schon eine
    // Übung steht, wird sie auf die neue Übung umgehängt. Foreign-Key-sicher
    // gegenüber existierenden Sets, weil wir die Zeile nicht löschen, sondern
    // ihre exercise_id aktualisieren.
    for (const [i, slug] of t.exerciseSlugs.entries()) {
      const exId = exerciseIdBySlug.get(slug);
      if (!exId) {
        throw new Error(
          `Exercise "${slug}" missing in seed (template ${t.slug}).`,
        );
      }
      db.insert(workoutTemplateExercises)
        .values({
          templateId: tpl.id,
          exerciseId: exId,
          position: i + 1,
          repMin: null,
          repMax: null,
        })
        .onConflictDoUpdate({
          target: [
            workoutTemplateExercises.templateId,
            workoutTemplateExercises.position,
          ],
          set: { exerciseId: exId, repMin: null, repMax: null },
        })
        .run();
    }

    // Sicherheits-Check: existieren Positionen, die wir nicht definiert haben?
    // Kommt nur vor, wenn wir Übungen aus dem Template entfernen würden.
    const existingPositions = db
      .select({ position: workoutTemplateExercises.position })
      .from(workoutTemplateExercises)
      .where(eq(workoutTemplateExercises.templateId, tpl.id))
      .all()
      .map((row) => row.position);
    const expected = new Set(t.exerciseSlugs.map((_, i) => i + 1));
    const orphans = existingPositions.filter((p) => !expected.has(p));
    if (orphans.length > 0) {
      console.warn(
        `  ⚠️  Template "${t.slug}" hat verwaiste Positionen: ${orphans.join(", ")} — manuell aufräumen, falls keine Sets mehr daran hängen.`,
      );
    }
  }
}

console.log("Seeding hypertrophy exercises + templates...");
const ids = seedExercises();
console.log(`  ${ids.size} exercises upserted.`);
seedTemplates(ids);

const templateCount = db
  .select({ count: sql<number>`count(*)` })
  .from(workoutTemplates)
  .get();
const tpExCount = db
  .select({ count: sql<number>`count(*)` })
  .from(workoutTemplateExercises)
  .get();
console.log(
  `  ${templateCount?.count ?? 0} templates, ${tpExCount?.count ?? 0} template-exercise links.`,
);
console.log("Done.");
