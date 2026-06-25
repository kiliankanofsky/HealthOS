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
  DailyActivity,
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
  // ---- Tag-Einfluss auf die Verlässlichkeit der Rechnung ----
  /** Cheat-Days im 14-Tage-Fenster — verzerren Rate (Wasser) UND Ø-Intake. */
  cheatDaysInWindow: number;
  /** Cheat-Meals (ohne Cheat-Day) im 14-Tage-Fenster. */
  cheatMealsInWindow: number;
  /** Cheat-Days ohne Tracking — aus der Intake-Mittelung herausgenommen. */
  cheatDayUnknownCount: number;
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
  const effectiveInWindow = buildEffectiveDays(nutrition, tags).filter(
    (d) => d.date >= fromIso && d.date <= todayIso,
  );
  const days = effectiveInWindow.filter((d) => d.caloriesKcal != null);
  // Cheat-Tags im selben Fenster — sie verfälschen sowohl die beobachtete
  // Gewichts-Rate (Wasser-Einlagerung) als auch den Ø-Intake; deshalb wird die
  // Rechnung in der Card als "unsicher" markiert, wenn welche vorkommen.
  const cheatDaysInWindow = effectiveInWindow.filter((d) => d.cheatDay).length;
  const cheatMealsInWindow = effectiveInWindow.filter(
    (d) => d.cheatMeal && !d.cheatDay,
  ).length;
  const cheatDayUnknownCount = effectiveInWindow.filter(
    (d) => d.kind === "cheat-day-unknown",
  ).length;
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
    cheatDaysInWindow,
    cheatMealsInWindow,
    cheatDayUnknownCount,
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

// ============================================================
// Maintenance-Card — Erhaltungsbedarf (TDEE) aus Energiebilanz.
//
// In einer Erhaltungsphase ist nicht "wie viel ab-/zunehmen" die Frage, sondern
// "wie viel kann ich essen, ohne mein Gewicht zu verändern" (= TDEE). Das lässt
// sich aus den eigenen Daten ableiten: Wenn du über N Tage im Schnitt I kcal
// isst und dein Gewicht sich dabei um Δkg ändert, dann war dein tägliches
// Energie-Ungleichgewicht (Δkg/Tag × 7700) und damit:
//
//     TDEE ≈ Ø-Intake − (Gewichts-Rate kg/Tag × 7700)
//
// Wir rechnen das über drei Fenster (7/14/28 Tage), damit kurzfristiges Rauschen
// (Wasser) gegen die längere, stabilere Schätzung gestellt werden kann. Als
// zweite, unabhängige Schätzung kommt Garmins gemessener Tagesverbrauch
// (daily_activity.totalKcal) dazu. Konsolidiert = Median der validen Bilanz-
// Schätzungen.
// ============================================================

const MAINTENANCE_WINDOWS = [7, 14, 28] as const;
// Mindest-Datenlage pro Fenster, damit eine Bilanz-Schätzung verlässlich ist.
const MIN_INTAKE_DAYS = 3;
const MIN_WEIGHT_ENTRIES = 3;

export type MaintenanceWindow = {
  days: number;
  avgIntakeKcal: number | null;
  intakeDayCount: number;
  /** Gewichtsänderung über das Fenster (Regressions-geglättet), kg. */
  weightDeltaKg: number | null;
  weightEntryCount: number;
  /** Erhaltungsbedarf aus der Energiebilanz (Ø-Intake − Rate×7700), kcal/Tag. */
  balanceTdeeKcal: number | null;
  /** Garmins gemessener Ø-Tagesverbrauch im Fenster, kcal/Tag. */
  garminTdeeKcal: number | null;
  garminDayCount: number;
};

export type MaintenanceEstimate = {
  windows: MaintenanceWindow[];
  /** Konsolidierter Erhaltungsbedarf — Median valider Bilanz-TDEEs (auf 10 gerundet). */
  recommendedMaintenanceKcal: number | null;
  /** Sekundär: Median der Garmin-Tagesverbräuche (auf 10 gerundet). */
  garminMaintenanceKcal: number | null;
  /** Cheat-Tags im 28-Tage-Fenster — verzerren Rate und Intake. */
  cheatDaysInWindow: number;
  cheatMealsInWindow: number;
};

// Least-squares-Steigung (kg/Tag) über (Tag-Offset, Gewicht). Null wenn < 2 Punkte.
function weightRatePerDay(points: { x: number; y: number }[]): number | null {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  return (n * sxy - sx * sy) / denom;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function dayOffset(fromIso: string, iso: string): number {
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(`${iso}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function buildMaintenanceEstimate(input: {
  weightEntries: WeightEntry[]; // chronologisch aufsteigend
  nutrition: NutritionEntry[];
  tags: DailyTag[];
  activity: DailyActivity[];
  todayIso: string;
}): MaintenanceEstimate {
  const { weightEntries, nutrition, tags, activity, todayIso } = input;
  const effectiveAll = buildEffectiveDays(nutrition, tags);

  const windows: MaintenanceWindow[] = MAINTENANCE_WINDOWS.map((days) => {
    const fromIso = isoDaysAgo(todayIso, days - 1);

    // Intake (Cheat-bereinigt) im Fenster.
    const intakeDays = effectiveAll.filter(
      (d) => d.date >= fromIso && d.date <= todayIso && d.caloriesKcal != null,
    );
    const avgIntakeKcal =
      intakeDays.length >= MIN_INTAKE_DAYS
        ? Math.round(
            intakeDays.reduce((acc, d) => acc + (d.caloriesKcal ?? 0), 0) /
              intakeDays.length,
          )
        : null;

    // Gewichts-Rate im Fenster (Regression über alle Wiegungen).
    const wEntries = weightEntries.filter(
      (e) => e.date >= fromIso && e.date <= todayIso,
    );
    const rate =
      wEntries.length >= MIN_WEIGHT_ENTRIES
        ? weightRatePerDay(
            wEntries.map((e) => ({ x: dayOffset(fromIso, e.date), y: e.weightKg })),
          )
        : null;
    const weightDeltaKg = rate != null ? Math.round(rate * (days - 1) * 100) / 100 : null;

    const balanceTdeeKcal =
      avgIntakeKcal != null && rate != null
        ? Math.round((avgIntakeKcal - rate * KCAL_PER_KG) / 10) * 10
        : null;

    // Garmin-Tagesverbrauch im Fenster.
    const actDays = activity.filter(
      (a) => a.date >= fromIso && a.date <= todayIso && a.totalKcal > 0,
    );
    const garminTdeeKcal =
      actDays.length > 0
        ? Math.round(
            actDays.reduce((acc, a) => acc + a.totalKcal, 0) / actDays.length / 10,
          ) * 10
        : null;

    return {
      days,
      avgIntakeKcal,
      intakeDayCount: intakeDays.length,
      weightDeltaKg,
      weightEntryCount: wEntries.length,
      balanceTdeeKcal,
      garminTdeeKcal,
      garminDayCount: actDays.length,
    };
  });

  const balanceValues = windows
    .map((w) => w.balanceTdeeKcal)
    .filter((v): v is number => v != null);
  const garminValues = windows
    .map((w) => w.garminTdeeKcal)
    .filter((v): v is number => v != null);
  const recM = median(balanceValues);
  const garM = median(garminValues);

  // Cheat-Tags im längsten (28d) Fenster.
  const fromIso28 = isoDaysAgo(todayIso, MAINTENANCE_WINDOWS[MAINTENANCE_WINDOWS.length - 1] - 1);
  const effective28 = effectiveAll.filter(
    (d) => d.date >= fromIso28 && d.date <= todayIso,
  );

  return {
    windows,
    recommendedMaintenanceKcal: recM != null ? Math.round(recM / 10) * 10 : null,
    garminMaintenanceKcal: garM != null ? Math.round(garM / 10) * 10 : null,
    cheatDaysInWindow: effective28.filter((d) => d.cheatDay).length,
    cheatMealsInWindow: effective28.filter((d) => d.cheatMeal && !d.cheatDay).length,
  };
}
