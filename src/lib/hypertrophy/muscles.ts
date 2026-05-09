// Muskelgruppen-Katalog für den anatomischen Avatar.
//
// Die App nutzt feinkörnige DB-Slugs (z.B. "chest-upper", "side-delt", "lats")
// in `exercises.primaryMuscles` / `secondaryMuscles`. Der Avatar-SVG
// (react-body-highlighter, MIT) zeichnet eine kleinere Menge an Regionen.
// Hier liegt die Übersetzungsschicht zwischen beiden Welten plus die
// Aggregation pro Workout.

/** Alle DB-Slugs, die im Seed verwendet werden. */
export const DB_MUSCLE_SLUGS = [
  "chest",
  "chest-upper",
  "lats",
  "upper-back",
  "mid-back",
  "lower-back",
  "front-delt",
  "side-delt",
  "rear-delt",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "core",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
] as const;

export type DbMuscleSlug = (typeof DB_MUSCLE_SLUGS)[number];

/** Anzeigenamen für Tooltips / Sheet-Titel. */
export const MUSCLE_LABELS: Record<DbMuscleSlug, string> = {
  chest: "Brust",
  "chest-upper": "Obere Brust",
  lats: "Lats",
  "upper-back": "Oberer Rücken",
  "mid-back": "Mittlerer Rücken",
  "lower-back": "Unterer Rücken",
  "front-delt": "Vordere Schulter",
  "side-delt": "Seitliche Schulter",
  "rear-delt": "Hintere Schulter",
  biceps: "Bizeps",
  triceps: "Trizeps",
  forearms: "Unterarme",
  abs: "Bauch",
  core: "Core / Schräge",
  quads: "Quadrizeps",
  hamstrings: "Beinbeuger",
  glutes: "Gesäß",
  calves: "Waden",
};

/**
 * Anatomie-Regionen, die der Avatar zeichnet. Stimmen mit den IDs in
 * `anatomy-paths.ts` überein.
 */
export const AVATAR_REGIONS = [
  "chest",
  "abs",
  "obliques",
  "biceps",
  "triceps",
  "forearm",
  "front-deltoids",
  "back-deltoids",
  "trapezius",
  "upper-back",
  "lower-back",
  "quadriceps",
  "hamstring",
  "gluteal",
  "calves",
] as const;

export type AvatarRegion = (typeof AVATAR_REGIONS)[number];

/**
 * Übersetzung DB-Slug → Avatar-Regionen (eine DB-Gruppe kann mehrere SVG-Regionen
 * highlighten). Mapping ist pragmatisch — die genutzte Open-Source-Lib zeichnet
 * z.B. keine separaten Lats; der Mittelrücken wird hier mitübernommen. Saubere
 * 1:1-Pfade kommen mit dem späteren Custom-SVG (siehe Notion 0.5 Exec).
 */
export const DB_TO_AVATAR_REGIONS: Record<DbMuscleSlug, AvatarRegion[]> = {
  chest: ["chest"],
  "chest-upper": ["chest"],
  lats: ["upper-back"],
  "upper-back": ["trapezius"],
  "mid-back": ["upper-back"],
  "lower-back": ["lower-back"],
  "front-delt": ["front-deltoids"],
  "side-delt": ["front-deltoids", "back-deltoids"],
  "rear-delt": ["back-deltoids"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearm"],
  abs: ["abs"],
  core: ["obliques"],
  quads: ["quadriceps"],
  hamstrings: ["hamstring"],
  glutes: ["gluteal"],
  calves: ["calves"],
};

/** Inverse: welche DB-Slugs werden auf eine Avatar-Region projiziert. */
export const AVATAR_REGION_TO_DB: Record<AvatarRegion, DbMuscleSlug[]> = (() => {
  const map = new Map<AvatarRegion, DbMuscleSlug[]>();
  for (const slug of DB_MUSCLE_SLUGS) {
    for (const region of DB_TO_AVATAR_REGIONS[slug]) {
      const list = map.get(region) ?? [];
      list.push(slug);
      map.set(region, list);
    }
  }
  return Object.fromEntries(map.entries()) as Record<AvatarRegion, DbMuscleSlug[]>;
})();

export type HighlightLevel = "primary" | "secondary";

/**
 * Aggregiert die Muskel-Markierungen einer Workout-Vorlage über alle Übungen.
 * Regel "höchste Stufe gewinnt": wenn irgendeine Übung den Muskel als primary
 * listet, ist er auf Workout-Ebene primary; sonst secondary; sonst gar nicht.
 */
export function aggregateWorkoutMuscles(
  exercises: { primaryMuscles: string[]; secondaryMuscles: string[] }[],
): Map<DbMuscleSlug, HighlightLevel> {
  const out = new Map<DbMuscleSlug, HighlightLevel>();
  for (const ex of exercises) {
    for (const slug of ex.primaryMuscles) {
      if (!isDbSlug(slug)) continue;
      out.set(slug, "primary");
    }
    for (const slug of ex.secondaryMuscles) {
      if (!isDbSlug(slug)) continue;
      if (out.get(slug) === "primary") continue;
      out.set(slug, "secondary");
    }
  }
  return out;
}

/**
 * Projiziert eine DB-Slug-Markierung auf Avatar-Regionen — für die SVG-
 * Renderschicht. Höchste Stufe gewinnt auch hier (zwei DB-Slugs auf derselben
 * Region: primary > secondary).
 */
export function projectMuscleMapToAvatar(
  dbMap: Map<DbMuscleSlug, HighlightLevel>,
): Map<AvatarRegion, HighlightLevel> {
  const out = new Map<AvatarRegion, HighlightLevel>();
  for (const [slug, level] of dbMap.entries()) {
    for (const region of DB_TO_AVATAR_REGIONS[slug]) {
      if (out.get(region) === "primary") continue;
      out.set(region, level);
    }
  }
  return out;
}

function isDbSlug(s: string): s is DbMuscleSlug {
  return (DB_MUSCLE_SLUGS as readonly string[]).includes(s);
}
