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
  getAllPhases,
  getAllWeightEntries,
  getCurrentTrainingPlan,
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
import { buildNutritionRecommendation } from "@/lib/utils/nutrition-recommendation";
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
    gym,
    plan,
    metrics,
    runsRaw,
  ] = await Promise.all([
    getAllWeightEntries(),
    getAllPhases(),
    // 14 Tage — die deterministische Kalorien-Empfehlung mittelt über 2 Wochen.
    getNutritionEntries({ from: isoDaysAgo(todayIso, 13), to: todayIso }),
    getRecentGymSummaries(6),
    getCurrentTrainingPlan(),
    getDailyMetricsBetween(isoDaysAgo(todayIso, 14), todayIso),
    // 180 Tage, damit die 42-Tage-CTL gut "aufgewärmt" ist (wie Plan-Chat).
    getRunSessionsBetween(isoDaysAgo(todayIso, 180), todayIso),
  ]);

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
    todayIso,
  });
  if (rec.phaseKind != null) {
    weightLines.push(
      `Kalorien-Empfehlung (deterministisch, Phase ${PHASE_LABELS[rec.phaseKind]}): ` +
        `beobachtet ${signedKg(rec.observedWeeklyDeltaKg)}/Woche vs. Ziel ${signedKg(rec.targetWeeklyDeltaKg)}/Woche · ` +
        `Ø Intake (14d) ${rec.avgIntakeKcal != null ? `${rec.avgIntakeKcal} kcal` : "—"} · ` +
        (rec.adjustmentKcal != null && rec.recommendedIntakeKcal != null
          ? `Anpassung ${rec.adjustmentKcal > 0 ? "+" : ""}${rec.adjustmentKcal} kcal/Tag → empfohlenes Ziel ~${rec.recommendedIntakeKcal} kcal/Tag${rec.adjustmentCapped ? " (gedeckelt auf ±500)" : ""}`
          : `(zu wenig Daten für eine konkrete Anpassung)`),
    );
  }

  // ---- Nutrition (letzte 7 Tage) ----
  const nutritionLines =
    nutrition.length === 0
      ? ["(keine Nutrition-Daten in den letzten 7 Tagen)"]
      : nutrition.map(
          (n) =>
            `  ${n.date}: ${n.caloriesKcal} kcal · ${Math.round(n.proteinG)}g Protein`,
        );

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
    `NUTRITION (letzte 7 Tage, fddb):`,
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
