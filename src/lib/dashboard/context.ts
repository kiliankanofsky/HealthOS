// ============================================================
// Dashboard — gemeinsamer KI-Daten-Kontext.
//
// Baut EINEN deutschen Text-Block mit allen relevanten Daten der App:
// Gewicht + Phase, Nutrition, Gym-Sessions, Trainingsplan, Garmin-Erholung,
// Fitness/Fatigue/Form und Trainingshistorie. Wird von der täglichen
// Overview-Generierung UND dem ganzheitlichen Dashboard-Chat genutzt —
// so sehen beide garantiert dieselben Daten.
// ============================================================

import {
  getAllDailyTags,
  getAllNutritionExclusions,
  getAllPhases,
  getAllWeightEntries,
  getCurrentTrainingPlan,
  getDailyActivityEntries,
  getDailyMetricsBetween,
  getNutritionEntries,
  getRunSessionsBetween,
  getSessionsForPlan,
} from "@/lib/db/queries";
import type { TrainingPlanSession, WeightPhase } from "@/lib/db/schema";
import { fitnessText, metricsText, runsText } from "@/lib/endurance/ai-chat";
import { formatPace, formatSecondsAsHms } from "@/lib/endurance/plan";
import { SESSION_TYPE_LABELS } from "@/lib/endurance/plan-format";
import { computeFitness } from "@/lib/endurance/training-load";
import {
  buildEffectiveDays,
  buildMaintenanceEstimate,
  buildNutritionRecommendation,
  type EffectiveDay,
} from "@/lib/utils/nutrition-recommendation";
import { computeWeightStats, diff, phaseForDate } from "@/lib/utils/weight-stats";
import { getRecentGymSummaries } from "./gym";

// Re-Export für bestehende Importe (Startseite) — die Funktion lebt jetzt
// in utils/weight-stats, damit sie ohne den schweren Kontext nutzbar ist.
export { phaseForDate };

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const PHASE_LABELS: Record<WeightPhase["kind"], string> = {
  cut: "Cut (Defizit)",
  bulk: "Bulk (Aufbau)",
  maintenance: "Maintenance (Erhalt)",
};

function isoDaysAgo(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekday(iso: string): string {
  return WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()];
}

function kg(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)} kg`;
}

function signedKg(v: number | null): string {
  if (v == null) return "—";
  const r = Math.round(v * 10) / 10;
  return `${r > 0 ? "+" : ""}${r.toFixed(1)} kg`;
}

function formatEffectiveDayLine(d: EffectiveDay, proteinG: number | null): string {
  const protein = proteinG != null ? ` · ${Math.round(proteinG)}g Protein` : "";
  const annotations: string[] = [];
  if (d.cheatDay) annotations.push("Cheat-Day");
  if (d.cheatMeal) annotations.push("Cheat-Meal");
  switch (d.kind) {
    case "cheat-day-target":
    case "cheat-meal-target":
      annotations.push(`Tag-kcal verwendet${d.fddbKcal != null ? `; fddb ${d.fddbKcal} kcal ersetzt` : ""}`);
      break;
    case "cheat-day-fallback":
      annotations.push(`Cheat-Day ohne kcal-Ziel → fddb ×1,5 (war ${d.fddbKcal} kcal)`);
      break;
    case "cheat-meal-fallback":
      annotations.push(`Cheat-Meal ohne kcal-Ziel → fddb ×1,25 (war ${d.fddbKcal} kcal)`);
      break;
    case "cheat-day-unknown":
      return `  ${d.date}: kein Tracking — Cheat-Day, deutlich höhere Aufnahme angenommen`;
    case "excluded":
      return (
        `  ${d.date}: AUSGESCHLOSSEN — Zeitraum mit unzuverlässigem Tracking` +
        (d.fddbKcal != null
          ? ` (fddb meldet ${d.fddbKcal} kcal, bewusst ignoriert — NICHT als Aufnahme werten)`
          : "")
      );
  }
  const ann = annotations.length > 0 ? ` [${annotations.join(", ")}]` : "";
  return `  ${d.date}: ${d.caloriesKcal ?? "—"} kcal${protein}${ann}`;
}

function planSessionLine(s: TrainingPlanSession): string {
  const km =
    s.targetDistanceMeters != null
      ? `${(s.targetDistanceMeters / 1000).toFixed(1)} km`
      : formatSecondsAsHms(s.targetDurationSec);
  return `  ${s.date} (${weekday(s.date)}): ${SESSION_TYPE_LABELS[s.sessionType]} "${s.title}" · ${km} · ${s.status}`;
}

export async function buildHealthContext(todayIso: string): Promise<string> {
  const [
    weightEntries,
    phases,
    nutrition,
    allTags,
    gym,
    plan,
    metrics,
    runsRaw,
    exclusions,
  ] = await Promise.all([
    getAllWeightEntries(),
    getAllPhases(),
    // 14 Tage — die deterministische Kalorien-Empfehlung mittelt über 2 Wochen.
    getNutritionEntries({ from: isoDaysAgo(todayIso, 13), to: todayIso }),
    getAllDailyTags(),
    getRecentGymSummaries(6),
    getCurrentTrainingPlan(),
    getDailyMetricsBetween(isoDaysAgo(todayIso, 14), todayIso),
    // 180 Tage, damit die 42-Tage-CTL gut "aufgewärmt" ist (wie Plan-Chat).
    getRunSessionsBetween(isoDaysAgo(todayIso, 180), todayIso),
    // Ausgeschlossene Zeiträume: die KI soll nicht über Kalorien-Schnitte reden,
    // die aus sporadisch getrackten Tagen stammen.
    getAllNutritionExclusions(),
  ]);

  const fromIso = isoDaysAgo(todayIso, 13);
  const tagsInWindow = allTags.filter((t) => t.date >= fromIso && t.date <= todayIso);
  const effectiveDays = buildEffectiveDays(nutrition, tagsInWindow, exclusions);

  const runs = [...runsRaw].sort((a, b) => a.date.localeCompare(b.date));
  const fitness = computeFitness(
    runs.map((r) => ({ date: r.date, trainingLoad: r.trainingLoad })),
    todayIso,
  );

  // ---- Gewicht ----
  const stats = computeWeightStats(weightEntries);
  const phase = phaseForDate(phases, todayIso);
  const weekDelta = diff(stats.weekAvg.avg, stats.prevWeekAvg.avg);
  const weightLines = [
    `Aktuelle Phase: ${phase ? `${PHASE_LABELS[phase.kind]} seit ${phase.startDate}` : "(keine Phase hinterlegt)"}`,
    `Aktuelles Gewicht: ${kg(stats.current)} (${stats.currentDate ?? "—"})`,
    `7-Tage-Schnitt: ${kg(stats.weekAvg.avg)} · Vorwoche: ${kg(stats.prevWeekAvg.avg)} · Δ Woche: ${signedKg(weekDelta)}`,
    `4-Wochen-Schnitt: ${kg(stats.fourWeekAvg.avg)}`,
  ];

  // Deterministische Kalorien-Empfehlung (gleiche Engine wie die Card auf
  // /weight) — gibt der KI eine belastbare Zahl für Phasen-Empfehlungen.
  const rec = buildNutritionRecommendation({
    weightEntries,
    phases,
    nutrition,
    tags: tagsInWindow,
    exclusions,
    todayIso,
  });
  if (rec.phaseKind === "maintenance") {
    // In der Erhaltungsphase ist die relevante Zahl der TDEE (Erhaltungsbedarf),
    // nicht eine +/− Anpassung — gleiche Engine wie die Maintenance-Card.
    const activity = await getDailyActivityEntries({ source: "garmin" });
    const maint = buildMaintenanceEstimate({
      weightEntries,
      nutrition,
      tags: tagsInWindow,
      exclusions,
      activity,
      todayIso,
    });
    weightLines.push(
      `Erhaltungsbedarf (TDEE aus Energiebilanz): ` +
        (maint.recommendedMaintenanceKcal != null
          ? `~${maint.recommendedMaintenanceKcal} kcal/Tag (Median 7/14/28d)`
          : "zu wenig Daten") +
        (maint.garminMaintenanceKcal != null
          ? ` · Garmin-Abgleich ~${maint.garminMaintenanceKcal} kcal/Tag`
          : ""),
    );
  } else if (rec.phaseKind != null) {
    weightLines.push(
      `Kalorien-Empfehlung (deterministisch, Phase ${PHASE_LABELS[rec.phaseKind]}): ` +
        `beobachtet ${signedKg(rec.observedWeeklyDeltaKg)}/Woche vs. Ziel ${signedKg(rec.targetWeeklyDeltaKg)}/Woche · ` +
        `Ø Intake (14d) ${rec.avgIntakeKcal != null ? `${rec.avgIntakeKcal} kcal` : "—"} · ` +
        (rec.adjustmentKcal != null && rec.recommendedIntakeKcal != null
          ? `Anpassung ${rec.adjustmentKcal > 0 ? "+" : ""}${rec.adjustmentKcal} kcal/Tag → empfohlenes Ziel ~${rec.recommendedIntakeKcal} kcal/Tag${rec.adjustmentCapped ? " (gedeckelt auf ±500)" : ""}`
          : `(zu wenig Daten für eine konkrete Anpassung)`),
    );
  }
  // Ausgeschlossene Zeiträume explizit benennen: sonst würde die KI aus den
  // fehlenden Tageszeilen "hat nichts gegessen" statt "nicht verwertbar" lesen.
  if (rec.excludedDaysInWindow > 0) {
    weightLines.push(
      `⚠ ${rec.excludedDaysInWindow} der letzten ${rec.windowDays} Tage liegen in einem manuell ausgeschlossenen Zeitraum ` +
        `(sporadisches fddb-Tracking, z.B. Urlaub). Deren Kalorien sind KEINE Aufnahme-Daten — nicht mitteln, nicht als Fasten deuten.`,
    );
  }
  // Explizite Cheat-Tag-Warnung für die KI (verlässlicher als das Zählen der
  // Tageszeilen) — die Rechnung oben ist dann zwangsläufig unsicher.
  if (rec.cheatDaysInWindow > 0 || rec.cheatMealsInWindow > 0) {
    weightLines.push(
      `⚠ Cheat-Tags im 14-Tage-Fenster: ${rec.cheatDaysInWindow} Cheat-Day(s), ${rec.cheatMealsInWindow} Cheat-Meal(s)` +
        (rec.cheatDayUnknownCount > 0
          ? ` (${rec.cheatDayUnknownCount} ohne Tracking, aus Schnitt entfernt)`
          : "") +
        ` → beobachtete Rate (Wasser-Einlagerung) und Ø-Intake verzerrt, Empfehlung unsicher.`,
    );
  }

  // ---- Nutrition (letzte 14 Tage, Cheat-Tags überschreiben fddb) ----
  const proteinByDate = new Map(nutrition.map((n) => [n.date, n.proteinG]));
  const nutritionLines =
    effectiveDays.length === 0
      ? ["(keine Nutrition-Daten in den letzten 14 Tagen)"]
      : effectiveDays.map((d) => formatEffectiveDayLine(d, proteinByDate.get(d.date) ?? null));

  // ---- Gym ----
  const gymLines =
    gym.length === 0
      ? ["(keine Gym-Sessions erfasst)"]
      : gym.map(
          (g) =>
            `  ${g.date} (${weekday(g.date)}): ${g.label} (${g.cycle}. Session) · Σe1RM ${g.totalE1} kg${g.deltaToPrev != null ? ` (${g.deltaToPrev > 0 ? "+" : ""}${g.deltaToPrev} vs. letzte ${g.label})` : ""} · ${g.setCount} Sätze · Volumen ${g.volume} kg`,
        );

  // ---- Endurance-Plan ----
  let planLines: string[];
  if (!plan) {
    planLines = ["(kein aktiver Trainingsplan)"];
  } else {
    const sessions = await getSessionsForPlan(plan.id);
    const upcoming = sessions
      .filter((s) => s.date >= todayIso)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
    planLines = [
      `Plan "${plan.name}" — Race ${plan.raceName ?? "—"} am ${plan.raceDate ?? "—"}, Ziel ${formatSecondsAsHms(plan.targetTimeSeconds)} (${formatPace(plan.targetPaceSecPerKm, { withUnit: true })}).`,
      upcoming.length > 0
        ? "Nächste geplante Einheiten:"
        : "Keine anstehenden Einheiten im Plan.",
      ...upcoming.map(planSessionLine),
    ];
  }

  // ---- Lauf-Wochenvolumen (diese vs. letzte Woche) ----
  const dow = (new Date(`${todayIso}T00:00:00`).getDay() + 6) % 7;
  const mondayIso = isoDaysAgo(todayIso, dow);
  const prevMondayIso = isoDaysAgo(mondayIso, 7);
  const kmBetween = (from: string, to: string) =>
    runs
      .filter((r) => r.date >= from && r.date <= to)
      .reduce((acc, r) => acc + r.distanceMeters, 0) / 1000;
  const thisWeekKm = kmBetween(mondayIso, todayIso);
  const lastWeekKm = kmBetween(prevMondayIso, isoDaysAgo(mondayIso, 1));

  return [
    `Heute ist ${weekday(todayIso)}, der ${todayIso}.`,
    ``,
    `GEWICHT:`,
    ...weightLines,
    ``,
    `NUTRITION (letzte 14 Tage; Cheat-Day/Cheat-Meal-Tags überschreiben den fddb-Wert):`,
    ...nutritionLines,
    ``,
    `GYM (letzte Sessions, neueste zuerst):`,
    ...gymLines,
    ``,
    `ENDURANCE-PLAN:`,
    ...planLines,
    ``,
    `LAUF-WOCHENVOLUMEN: diese Woche ${thisWeekKm.toFixed(1)} km (Mo–heute) · letzte Woche ${lastWeekKm.toFixed(1)} km`,
    ``,
    `LETZTE ERHOLUNGSDATEN (Garmin):`,
    metricsText(metrics),
    ``,
    `FITNESS / FATIGUE / FORM (aus Garmin Training Load):`,
    fitnessText(fitness),
    ``,
    `TRAININGSHISTORIE (letzte Läufe):`,
    runsText(runs),
  ].join("\n");
}
