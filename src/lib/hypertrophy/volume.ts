// ============================================================
// Hypertrophy — Wochen-Volumen pro Muskelgruppe.
//
// Zählweise (gängige Hypertrophie-Konvention):
//   - Jeder ausgeführte Satz (reps > 0) zählt 1,0 für jede primäre
//     Muskelgruppe der Übung und 0,5 für jede sekundäre.
//   - Referenzrahmen: ~10–20 gewichtete Sätze pro Muskelgruppe und Woche
//     gelten als solides Hypertrophie-Volumen.
//
// Genutzt von der Anatomie-Card auf /hypertrophy (Avatar-Färbung + Liste).
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

export async function getMuscleVolumeBetween(
  fromIso: string,
  toIso: string,
): Promise<MuscleVolumeEntry[]> {
  const [templates, sessions] = await Promise.all([
    getAllTemplates(),
    getAllSessions(),
  ]);
  const inRange = sessions.filter((s) => s.date >= fromIso && s.date <= toIso);
  if (inRange.length === 0) return [];

  // templateExerciseId → Muskelgruppen der Stamm-Übung.
  const musclesByTplEx = new Map<
    number,
    { primary: string[]; secondary: string[] }
  >();
  for (const t of templates) {
    const rows = await getTemplateExercises(t.id);
    for (const r of rows) {
      musclesByTplEx.set(r.templateExercise.id, {
        primary: r.exercise.primaryMuscles,
        secondary: r.exercise.secondaryMuscles,
      });
    }
  }

  const totals = new Map<DbMuscleSlug, number>();
  const add = (slug: string, amount: number) => {
    if (!(DB_MUSCLE_SLUGS as readonly string[]).includes(slug)) return;
    const key = slug as DbMuscleSlug;
    totals.set(key, (totals.get(key) ?? 0) + amount);
  };

  for (const session of inRange) {
    const sets = await getSetsBySession(session.id);
    for (const set of sets) {
      if (set.reps <= 0) continue;
      const muscles = musclesByTplEx.get(set.templateExerciseId);
      if (!muscles) continue;
      for (const m of muscles.primary) add(m, 1);
      for (const m of muscles.secondary) add(m, 0.5);
    }
  }

  return [...totals.entries()]
    .map(([muscle, sets]) => ({ muscle, sets: Math.round(sets * 10) / 10 }))
    .sort((a, b) => b.sets - a.sets);
}
