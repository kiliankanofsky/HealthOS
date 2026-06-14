// ============================================================
// Hypertrophy — Wochen-Volumen pro Muskelgruppe.
//
// Zählweise (gängige Hypertrophie-Konvention):
//   - Jeder ausgeführte Satz (reps > 0) zählt 1,0 für jede primäre
//     Muskelgruppe der Übung und 0,5 für jede sekundäre.
//   - Referenzrahmen: ~10–20 gewichtete Sätze pro Muskelgruppe und Woche
//     gelten als solides Hypertrophie-Volumen.
//
// Genutzt von der Anatomie-Card auf /hypertrophy (Avatar-Färbung + Liste +
// Hover mit den beitragenden Übungen).
// ============================================================

import {
  getAllSessions,
  getAllTemplates,
  getSetsBySession,
  getTemplateExercises,
} from "@/lib/db/queries";

import { DB_MUSCLE_SLUGS, type DbMuscleSlug } from "./muscles";

export type MuscleVolumeEntry = {
  muscle: DbMuscleSlug;
  /** Gewichtete Sätze (primär 1,0 / sekundär 0,5), auf 0,1 gerundet. */
  sets: number;
};

// Eine Übung, die zum Volumen einer Muskelgruppe beigetragen hat.
export type MuscleExerciseVolume = {
  exerciseSlug: string;
  exerciseName: string;
  /** Template, unter dem die Übung gelaufen ist — für den Detail-Link. */
  templateSlug: string;
  /** Rolle für DIESE Muskelgruppe (primär 1,0 / sekundär 0,5). */
  level: "primary" | "secondary";
  /** Gewichteter Satz-Beitrag dieser Übung zu dieser Muskelgruppe. */
  sets: number;
};

export type MuscleVolumeDetail = {
  muscle: DbMuscleSlug;
  /** Gewichtete Sätze gesamt (Summe über alle Übungen). */
  sets: number;
  /** Beitragende Übungen, absteigend nach Sätzen. */
  exercises: MuscleExerciseVolume[];
};

// Volle Aufschlüsselung: pro Muskelgruppe die gewichteten Sätze UND die
// Übungen, die sie verursacht haben (für den Avatar-Hover).
export async function getMuscleVolumeDetailBetween(
  fromIso: string,
  toIso: string,
): Promise<MuscleVolumeDetail[]> {
  const [templates, sessions] = await Promise.all([
    getAllTemplates(),
    getAllSessions(),
  ]);
  const inRange = sessions.filter((s) => s.date >= fromIso && s.date <= toIso);
  if (inRange.length === 0) return [];

  const templateById = new Map(templates.map((t) => [t.id, t]));

  // templateExerciseId → Stamm-Übung (Slug/Name + Muskelgruppen).
  const exByTplEx = new Map<
    number,
    { slug: string; name: string; primary: string[]; secondary: string[] }
  >();
  for (const t of templates) {
    const rows = await getTemplateExercises(t.id);
    for (const r of rows) {
      exByTplEx.set(r.templateExercise.id, {
        slug: r.exercise.slug,
        name: r.exercise.name,
        primary: r.exercise.primaryMuscles,
        secondary: r.exercise.secondaryMuscles,
      });
    }
  }

  const isDbSlug = (s: string): s is DbMuscleSlug =>
    (DB_MUSCLE_SLUGS as readonly string[]).includes(s);

  const totals = new Map<DbMuscleSlug, number>();
  // muscle → (exerciseSlug → Akkumulator)
  const byMuscle = new Map<DbMuscleSlug, Map<string, MuscleExerciseVolume>>();

  const add = (
    muscle: string,
    ex: { slug: string; name: string },
    templateSlug: string,
    level: "primary" | "secondary",
    weight: number,
  ) => {
    if (!isDbSlug(muscle)) return;
    totals.set(muscle, (totals.get(muscle) ?? 0) + weight);
    let map = byMuscle.get(muscle);
    if (!map) {
      map = new Map();
      byMuscle.set(muscle, map);
    }
    const existing = map.get(ex.slug);
    if (existing) {
      existing.sets += weight;
      // Erst-Template behalten (jedes Vorkommen ist ein gültiger Link-Ziel).
      if (!existing.templateSlug && templateSlug) existing.templateSlug = templateSlug;
    } else {
      map.set(ex.slug, {
        exerciseSlug: ex.slug,
        exerciseName: ex.name,
        templateSlug,
        level,
        sets: weight,
      });
    }
  };

  for (const session of inRange) {
    const templateSlug = templateById.get(session.templateId)?.slug ?? "";
    const sets = await getSetsBySession(session.id);
    for (const set of sets) {
      if (set.reps <= 0) continue;
      const ex = exByTplEx.get(set.templateExerciseId);
      if (!ex) continue;
      for (const m of ex.primary) add(m, ex, templateSlug, "primary", 1);
      for (const m of ex.secondary) add(m, ex, templateSlug, "secondary", 0.5);
    }
  }

  return [...totals.entries()]
    .map(([muscle, sets]) => ({
      muscle,
      sets: Math.round(sets * 10) / 10,
      exercises: [...(byMuscle.get(muscle)?.values() ?? [])]
        .map((e) => ({ ...e, sets: Math.round(e.sets * 10) / 10 }))
        .sort((a, b) => b.sets - a.sets),
    }))
    .sort((a, b) => b.sets - a.sets);
}

// Schlanke Variante (nur Muskel + Sätze) — delegiert an die Detail-Funktion.
export async function getMuscleVolumeBetween(
  fromIso: string,
  toIso: string,
): Promise<MuscleVolumeEntry[]> {
  const detail = await getMuscleVolumeDetailBetween(fromIso, toIso);
  return detail.map((d) => ({ muscle: d.muscle, sets: d.sets }));
}
