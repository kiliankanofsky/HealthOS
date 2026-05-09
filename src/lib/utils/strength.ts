// Strength-Score-Berechnungen für Hypertrophy-Charts.
//
// Wir nutzen die Epley-Formel für e1RM (estimated 1-Rep-Max):
//   e1RM = effectiveWeight × (1 + Reps / 30)
//
// Eigenschaften, die wir wollen:
// - Mehr Reps bei gleichem Gewicht ⇒ Score steigt langsam.
// - Höheres Gewicht (auch bei weniger Reps) ⇒ Score springt deutlich.
// - Reps = 0 ist "übersprungen" und wird ausgefiltert (kein 0-Score-Punkt).
//
// Unilaterale Übungen:
// - Default ist "per-side" — geloggt wird das Hantel-Gewicht pro Arm.
//   Score nutzt dieses Gewicht direkt.
// - "summed" — geloggt wurde das beidseitige Gesamtgewicht.
//   Score halbiert für Konsistenz mit "per-side"-Sätzen derselben Übung.
// - Bei nicht-unilateralen Übungen ist `weightMode` belanglos und das
//   Gewicht wird immer 1:1 verwendet.

export type WeightMode = "per-side" | "summed";

export type SetLike = {
  weightKg: number;
  reps: number;
  weightMode?: WeightMode;
  unilateral?: boolean;
};

// Liefert das für Score-Vergleiche relevante "effektive" Gewicht.
// Halbiert nur dann, wenn die Übung unilateral UND der Set summiert geloggt ist.
export function effectiveWeight(set: SetLike): number {
  if (!Number.isFinite(set.weightKg) || set.weightKg <= 0) return 0;
  if (set.unilateral && set.weightMode === "summed") return set.weightKg / 2;
  return set.weightKg;
}

// Standard-Epley auf rohem Gewicht.
export function epleyE1RM(weightKg: number, reps: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  if (!Number.isFinite(reps) || reps <= 0) return 0;
  return weightKg * (1 + reps / 30);
}

// e1RM unter Berücksichtigung des Weight-Mode (für Score-Vergleiche).
export function effectiveE1RM(set: SetLike): number {
  return epleyE1RM(effectiveWeight(set), set.reps);
}

// Best e1RM einer Set-Gruppe (eine Übung in einer Session, oder über alle Sätze).
// Liefert null, wenn keine validen Sätze vorhanden sind.
export function bestE1RM(sets: readonly SetLike[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    const v = effectiveE1RM(s);
    if (v <= 0) continue;
    if (best === null || v > best) best = v;
  }
  return best;
}

// Volume Load: Σ effectiveWeight × Reps. Übersprungene Sätze (reps=0) tragen 0 bei.
export function volumeLoad(sets: readonly SetLike[]): number {
  let sum = 0;
  for (const s of sets) {
    if (!Number.isFinite(s.reps) || s.reps <= 0) continue;
    const w = effectiveWeight(s);
    if (w <= 0) continue;
    sum += w * s.reps;
  }
  return sum;
}

// Top-Set-Weight (effektiv, also pro-Seite-normalisiert).
export function topSetWeight(sets: readonly SetLike[]): number | null {
  let bestWeight: number | null = null;
  let bestReps = 0;
  for (const s of sets) {
    if (s.reps <= 0) continue;
    const w = effectiveWeight(s);
    if (w <= 0) continue;
    if (
      bestWeight === null ||
      w > bestWeight ||
      (w === bestWeight && s.reps > bestReps)
    ) {
      bestWeight = w;
      bestReps = s.reps;
    }
  }
  return bestWeight;
}

// Auf 0,1 runden — für Anzeige.
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
