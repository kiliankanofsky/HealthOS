// ============================================================
// Dashboard — Gym-Session-Summaries.
//
// Aggregiert pro Workout-Session die Kennzahlen, die Startseite und
// KI-Kontext brauchen: Σ Best-e1RM (wie WorkoutCards), Satz-Anzahl,
// Volume Load und das Delta zur vorigen Session desselben Templates.
// Eine Abfrage-Runde für alles — die Page reicht das Ergebnis an
// Kalender-Card, Gym-Totals und KI weiter.
// ============================================================

import {
  getAllSessions,
  getAllTemplates,
  getSetsBySession,
  getTemplateExercises,
} from "@/lib/db/queries";
import type { WorkoutKind } from "@/lib/db/schema";
import { WORKOUT_LABELS } from "@/lib/hypertrophy/workouts";
import { bestE1RM, round1, volumeLoad } from "@/lib/utils/strength";

export type GymSessionSummary = {
  sessionId: number;
  date: string; // YYYY-MM-DD
  kind: WorkoutKind;
  slug: string;
  label: string;
  // Wievielte Ausführung dieses Templates ("n. Session" — der globale
  // Cycle bezieht sich dagegen auf die volle Rotation, siehe WorkoutCards).
  cycle: number;
  // Sätze mit reps > 0.
  setCount: number;
  // Σ Best-e1RM über alle Übungen der Session.
  totalE1: number;
  // Σ effektives Gewicht × Reps (Volume Load).
  volume: number;
  // Σe1RM-Differenz zur vorigen Session desselben Templates (null = keine Referenz).
  deltaToPrev: number | null;
};

export async function getRecentGymSummaries(
  limit = 10,
): Promise<GymSessionSummary[]> {
  const [templates, sessions] = await Promise.all([
    getAllTemplates(),
    getAllSessions(), // desc nach Datum
  ]);
  const templateById = new Map(templates.map((t) => [t.id, t]));

  // Unilateral-Flag pro Template-Exercise — nötig, damit e1RM/Volumen den
  // Weight-Mode korrekt anwenden (siehe utils/strength.ts).
  const unilateralByTplEx = new Map<number, boolean>();
  for (const t of templates) {
    const rows = await getTemplateExercises(t.id);
    for (const r of rows) {
      unilateralByTplEx.set(r.templateExercise.id, r.exercise.unilateral);
    }
  }

  // Totals für das Fenster + ein paar ältere Sessions (damit das Delta der
  // ältesten Session im Fenster noch eine Vergleichs-Session findet).
  const windowSessions = sessions.slice(0, limit + 3);
  const totalsById = new Map<number, { totalE1: number; setCount: number; volume: number }>();
  for (const s of windowSessions) {
    const sets = await getSetsBySession(s.id);
    const byExercise = new Map<
      number,
      { weightKg: number; reps: number; weightMode: "per-side" | "summed"; unilateral: boolean }[]
    >();
    for (const set of sets) {
      const unilateral = unilateralByTplEx.get(set.templateExerciseId) ?? false;
      const list = byExercise.get(set.templateExerciseId) ?? [];
      list.push({
        weightKg: set.weightKg,
        reps: set.reps,
        weightMode: set.weightMode,
        unilateral,
      });
      byExercise.set(set.templateExerciseId, list);
    }
    let totalE1 = 0;
    let volume = 0;
    for (const ex of byExercise.values()) {
      const best = bestE1RM(ex);
      if (best !== null) totalE1 += best;
      volume += volumeLoad(ex);
    }
    totalsById.set(s.id, {
      totalE1: round1(totalE1),
      setCount: sets.filter((x) => x.reps > 0).length,
      volume: Math.round(volume),
    });
  }

  const result: GymSessionSummary[] = [];
  for (let i = 0; i < Math.min(limit, sessions.length); i++) {
    const s = sessions[i];
    const tpl = templateById.get(s.templateId);
    const totals = totalsById.get(s.id);
    if (!tpl || !totals) continue;

    // Cycle = Anzahl Sessions desselben Templates bis einschließlich heute
    // (in-memory statt N Einzel-Queries — `sessions` enthält bereits alle).
    const cycle = sessions.filter(
      (x) => x.templateId === s.templateId && x.date <= s.date,
    ).length;

    // Vorige Session desselben Templates (Liste ist desc sortiert).
    const prev = sessions
      .slice(i + 1)
      .find((x) => x.templateId === s.templateId);
    const prevTotals = prev ? totalsById.get(prev.id) : undefined;
    const deltaToPrev =
      prevTotals && prevTotals.totalE1 > 0
        ? round1(totals.totalE1 - prevTotals.totalE1)
        : null;

    result.push({
      sessionId: s.id,
      date: s.date,
      kind: tpl.kind as WorkoutKind,
      slug: tpl.slug,
      label: WORKOUT_LABELS[tpl.kind as WorkoutKind],
      cycle,
      setCount: totals.setCount,
      totalE1: totals.totalE1,
      volume: totals.volume,
      deltaToPrev,
    });
  }
  return result;
}
