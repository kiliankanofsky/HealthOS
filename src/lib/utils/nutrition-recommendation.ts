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
  DailyTag,
  NutritionEntry,
  WeightEntry,
  WeightPhase,
} from "@/lib/db/schema";

import { computeWeightStats, diff, phaseForDate } from "./weight-stats";

// ============================================================
// Cheat-Tag-Override
//
// Wenn für einen Tag ein Cheat-Day- oder Cheat-Meal-Tag gesetzt ist, ist das
// fddb-Tracking nicht repräsentativ — der User trackt an diesen Tagen bewusst
// nicht alles. Stattdessen gilt:
//
//   1. kcalTarget aus daily_tags ist gesetzt → dieser Wert IST die Wahrheit
//      (z.B. "Cheat-Meal: 2000 kcal" überschreibt fddb 1000 kcal).
//   2. cheatDay ohne kcalTarget → Aufschlag CHEAT_DAY_FALLBACK_FACTOR auf den
//      fddb-Wert (Default 1.5×); existiert kein fddb-Wert, wird der Tag mit
//      `kind: "cheat-day-unknown"` markiert und in der Mittelung übersprungen.
//   3. cheatMeal ohne kcalTarget → Aufschlag CHEAT_MEAL_FALLBACK_FACTOR (1.25×).
//
// Genutzt von der Empfehlung UND vom Dashboard-KI-Kontext, damit beide dieselbe
// "wahre" Intake-Reihe sehen.
// ============================================================

const CHEAT_DAY_FALLBACK_FACTOR = 1.5;
const CHEAT_MEAL_FALLBACK_FACTOR = 1.25;

export type EffectiveDay = {
  date: string;
  /** Effektive Kalorien für den Tag — null, wenn weder fddb noch Tag-Wert greift. */
  caloriesKcal: number | null;
  /** Wie kam der Wert zustande? */
  kind:
    | "fddb"
    | "cheat-meal-target"
    | "cheat-meal-fallback"
    | "cheat-day-target"
    | "cheat-day-fallback"
    | "cheat-day-unknown";
  /** Original-fddb-Wert (falls vorhanden), für Anzeige/Debug. */
  fddbKcal: number | null;
  cheatDay: boolean;
  cheatMeal: boolean;
};

export function effectiveCaloriesForDay(
  entry: { caloriesKcal: number } | null,
  tag: Pick<DailyTag, "cheatDay" | "cheatMeal" | "kcalTarget"> | null,
  date: string,
): EffectiveDay {
  const fddb = entry != null && entry.caloriesKcal > 0 ? entry.caloriesKcal : null;
  const cheatDay = tag?.cheatDay === true;
  const cheatMeal = tag?.cheatMeal === true;
  const target = tag?.kcalTarget != null && tag.kcalTarget > 0 ? tag.kcalTarget : null;

  if (cheatDay) {
    if (target != null) {
      return { date, caloriesKcal: target, kind: "cheat-day-target", fddbKcal: fddb, cheatDay, cheatMeal };
    }
    if (fddb != null) {
      return {
        date,
        caloriesKcal: Math.round(fddb * CHEAT_DAY_FALLBACK_FACTOR),
        kind: "cheat-day-fallback",
        fddbKcal: fddb,
        cheatDay,
        cheatMeal,
      };
    }
    return { date, caloriesKcal: null, kind: "cheat-day-unknown", fddbKcal: null, cheatDay, cheatMeal };
  }

  if (cheatMeal) {
    if (target != null) {
      return { date, caloriesKcal: target, kind: "cheat-meal-target", fddbKcal: fddb, cheatDay, cheatMeal };
    }
    if (fddb != null) {
      return {
        date,
        caloriesKcal: Math.round(fddb * CHEAT_MEAL_FALLBACK_FACTOR),
        kind: "cheat-meal-fallback",
        fddbKcal: fddb,
        cheatDay,
        cheatMeal,
      };
    }
  }

  return { date, caloriesKcal: fddb, kind: "fddb", fddbKcal: fddb, cheatDay, cheatMeal };
}

/**
 * Reduziert Nutrition-Einträge + Daily-Tags auf eine Reihe effektiver Tage —
 * eine Zeile pro Datum, das mindestens eine Quelle (fddb oder Tag) hat.
 * Sortiert chronologisch aufsteigend.
 */
export function buildEffectiveDays(
  nutrition: NutritionEntry[],
  tags: DailyTag[],
): EffectiveDay[] {
  const byDateNutrition = new Map<string, NutritionEntry>();
  for (const n of nutrition) byDateNutrition.set(n.date, n);
  const byDateTag = new Map<string, DailyTag>();
  for (const t of tags) byDateTag.set(t.date, t);

  const dates = new Set<string>([...byDateNutrition.keys(), ...byDateTag.keys()]);
  const out: EffectiveDay[] = [];
  for (const d of dates) {
    out.push(effectiveCaloriesForDay(byDateNutrition.get(d) ?? null, byDateTag.get(d) ?? null, d));
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

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
  /** Daily-Tags mindestens für das Empfehlungsfenster (14 Tage). */
  tags: DailyTag[];
  todayIso: string;
}): NutritionRecommendation {
  const { weightEntries, phases, nutrition, tags, todayIso } = input;
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

  // Ø-Intake der letzten 14 Tage — Cheat-Day/Meal-Tags überschreiben fddb,
  // damit Cheat-Phasen die "wahre" Aufnahme spiegeln, nicht den getrackten
  // Teil-Wert.
  const fromIso = isoDaysAgo(todayIso, 13);
  const days = buildEffectiveDays(nutrition, tags).filter(
    (d) => d.date >= fromIso && d.date <= todayIso && d.caloriesKcal != null,
  );
  const avgIntakeKcal =
    days.length >= 4
      ? Math.round(
          days.reduce((acc, d) => acc + (d.caloriesKcal ?? 0), 0) / days.length,
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
    intakeDayCount: days.length,
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
