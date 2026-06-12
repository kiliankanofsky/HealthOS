// ============================================================
// Nutrition — deterministische Kalorien-Empfehlung je nach Phase.
//
// Idee: Die aktuelle Weight-Phase (Cut/Bulk/Maintenance) definiert eine
// Ziel-Rate (Δkg/Woche). Die tatsächliche Rate kommt aus den Gewichts-Daten
// der laufenden Phase (Vergleich 7-Tage-Schnitt vs. Vorwoche — dieselben
// Fenster wie im Weight-Chart). Die Differenz wird über die ~7700-kcal-Regel
// (1 kg Körperfett ≈ 7700 kcal) in eine tägliche Kalorien-Anpassung
// übersetzt und auf den Ø-Intake der letzten 14 Tage (fddb) angewendet.
//
// Genutzt von der Card auf /weight und als deterministischer Daten-Punkt
// im KI-Dashboard-Kontext.
// ============================================================

import type {
  NutritionEntry,
  WeightEntry,
  WeightPhase,
} from "@/lib/db/schema";

import { computeWeightStats, diff, phaseForDate } from "./weight-stats";

const KCAL_PER_KG = 7700;
// Sicherheits-Deckel: größere Sprünge als ±500 kcal/Tag empfehlen wir nie
// auf einmal — lieber anpassen und nächste Woche neu bewerten.
const MAX_ADJUSTMENT_KCAL = 500;

// Ziel-Raten als Anteil des Körpergewichts pro Woche.
const TARGET_WEEKLY_RATE: Record<WeightPhase["kind"], number> = {
  cut: -0.005, // −0,5 % KG/Woche
  bulk: +0.0025, // +0,25 % KG/Woche
  maintenance: 0,
};

export type NutritionRecommendation = {
  phaseKind: WeightPhase["kind"] | null;
  phaseStartDate: string | null;
  /** Beobachtete Rate aus den Phase-Daten des Weight-Charts (kg/Woche). */
  observedWeeklyDeltaKg: number | null;
  /** Anzahl Wiegungen, die in die beobachtete Rate eingeflossen sind. */
  observedEntryCount: number;
  /** Ziel-Rate der Phase (kg/Woche). */
  targetWeeklyDeltaKg: number | null;
  /** Ø-Kalorienaufnahme der letzten 14 Tage (nur Tage mit fddb-Daten). */
  avgIntakeKcal: number | null;
  intakeDayCount: number;
  /** Empfohlene tägliche Anpassung (auf 50 kcal gerundet, gedeckelt ±500). */
  adjustmentKcal: number | null;
  adjustmentCapped: boolean;
  /** Ø-Intake + Anpassung = empfohlenes Tagesziel. */
  recommendedIntakeKcal: number | null;
};

export function buildNutritionRecommendation(input: {
  weightEntries: WeightEntry[]; // chronologisch aufsteigend
  phases: WeightPhase[];
  nutrition: NutritionEntry[];
  todayIso: string;
}): NutritionRecommendation {
  const { weightEntries, phases, nutrition, todayIso } = input;
  const phase = phaseForDate(phases, todayIso);

  // Vergleichsbasis: nur Wiegungen innerhalb der laufenden Phase, damit die
  // Rate nicht von der vorherigen Phase verfälscht wird.
  const phaseEntries = phase
    ? weightEntries.filter((e) => e.date >= phase.startDate)
    : weightEntries;
  const stats = computeWeightStats(phaseEntries);
  const observed = diff(stats.weekAvg.avg, stats.prevWeekAvg.avg);
  const observedEntryCount = stats.weekAvg.count + stats.prevWeekAvg.count;
  // Mindest-Datenlage: je Fenster wenigstens 2 Wiegungen, sonst keine Rate.
  const observedValid =
    observed != null && stats.weekAvg.count >= 2 && stats.prevWeekAvg.count >= 2;

  const referenceWeight = stats.weekAvg.avg ?? stats.current;
  const targetWeeklyDeltaKg =
    phase && referenceWeight != null
      ? Math.round(TARGET_WEEKLY_RATE[phase.kind] * referenceWeight * 100) / 100
      : null;

  // Ø-Intake der letzten 14 Tage.
  const fromIso = isoDaysAgo(todayIso, 13);
  const recent = nutrition.filter(
    (n) => n.date >= fromIso && n.date <= todayIso && n.caloriesKcal > 0,
  );
  const avgIntakeKcal =
    recent.length >= 4
      ? Math.round(
          recent.reduce((acc, n) => acc + n.caloriesKcal, 0) / recent.length,
        )
      : null;

  let adjustmentKcal: number | null = null;
  let adjustmentCapped = false;
  if (observedValid && targetWeeklyDeltaKg != null) {
    const raw = ((targetWeeklyDeltaKg - observed) * KCAL_PER_KG) / 7;
    const rounded = Math.round(raw / 50) * 50;
    adjustmentCapped = Math.abs(rounded) > MAX_ADJUSTMENT_KCAL;
    adjustmentKcal = Math.max(
      -MAX_ADJUSTMENT_KCAL,
      Math.min(MAX_ADJUSTMENT_KCAL, rounded),
    );
  }

  const recommendedIntakeKcal =
    avgIntakeKcal != null && adjustmentKcal != null
      ? Math.round((avgIntakeKcal + adjustmentKcal) / 10) * 10
      : null;

  return {
    phaseKind: phase?.kind ?? null,
    phaseStartDate: phase?.startDate ?? null,
    observedWeeklyDeltaKg: observedValid
      ? Math.round(observed * 100) / 100
      : null,
    observedEntryCount,
    targetWeeklyDeltaKg,
    avgIntakeKcal,
    intakeDayCount: recent.length,
    adjustmentKcal,
    adjustmentCapped,
    recommendedIntakeKcal,
  };
}

function isoDaysAgo(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
