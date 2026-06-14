// ============================================================
// Run ⟷ geplante Session: Auto-Match.
//
// Entscheidet, ob ein absolvierter Garmin-Lauf eine geplante Trainings-Session
// erfüllt. Die genaue Pace darf abweichen — entscheidend ist, dass die
// SPLITS-ARCHITEKTUR generell passt:
//   • Distanz (bzw. Dauer) ungefähr getroffen,
//   • Struktur passt (Dauerlauf ↔ steady · Intervalle ↔ strukturiert),
//   • Intensität stimmt: locker (recovery/easy/long) wird an der HF gemessen,
//     Qualität (tempo/threshold/vo2max) an der Pace.
//
// Pure Funktion (keine DB) → testbar. Nutzt dieselben Bausteine wie die
// Plan-Anzeige (sessionTotals/buildSplits) und denselben CV-Begriff wie die
// Zonen-Schätzung.
// ============================================================

import type {
  RunLap,
  RunSession,
  TrainingPlanSession,
  TrainingPlanSessionType,
} from "@/lib/db/schema";
import type { HrZones, PaceZones } from "@/lib/endurance/plan";
import { buildSplits, sessionTotals, type SplitsBlock } from "@/lib/endurance/plan-splits";

// ---- Toleranzen / Varianz-Metriken (bewusst benannt + erklärt) ----

// Distanz (bzw. Dauer) darf um ±20 % abweichen — "Easy 9k" zählt auch, wenn
// 9,1 km bei anderer Pace gelaufen wurden, aber nicht ein 5er oder ein 15er.
const DISTANCE_TOL = 0.2;
// Variationskoeffizient der Lap-Paces: darunter = gleichmäßiger Dauerlauf,
// darüber = strukturierter Lauf (Intervalle/Tempowechsel). Etwas lockerer als
// die Zonen-Schätzung (0,06), weil hier nur grob klassifiziert wird.
const STEADY_CV_MAX = 0.08;
// Ab so vielen verwertbaren Laps trauen wir der Struktur-Klassifikation.
const MIN_LAPS_FOR_STRUCTURE = 3;
// Locker-Läufe: Ø-HF darf die Zonen-Obergrenze um bis zu 6 bpm überschreiten
// (HF-Drift, Hitze) und trotzdem als „locker genug" gelten.
const HR_TOL_BPM = 6;
// Qualität: Work-Pace darf ±6 % um das Ziel-Zonen-Band liegen.
const QUALITY_PACE_TOL = 0.06;

// Plausibilitäts-Grenzen für Lap-Paces (analog zone-estimation.ts).
const PACE_MIN = 150;
const PACE_MAX = 660;

const LOW_INTENSITY: ReadonlySet<TrainingPlanSessionType> = new Set([
  "recovery",
  "easy",
  "long",
]);

export type MatchInput = {
  session: Pick<
    TrainingPlanSession,
    "sessionType" | "primaryZone" | "targetDistanceMeters" | "targetDurationSec"
  >;
  blocks: SplitsBlock[];
  run: Pick<
    RunSession,
    "distanceMeters" | "durationSeconds" | "avgHeartRate" | "avgPaceSecPerKm" | "lapsJson"
  >;
  paceZones: PaceZones | null;
  hrZones: HrZones | null;
};

export type MatchResult = { matched: boolean; reason: string };

export function matchRunToSession(input: MatchInput): MatchResult {
  const { session, blocks, run, paceZones, hrZones } = input;
  const reasons: string[] = [];

  // ---- 1. Distanz (Fallback Dauer) ----
  const totals = sessionTotals(blocks, paceZones);
  const plannedDistance = session.targetDistanceMeters ?? totals.distanceMeters;
  const plannedDuration = session.targetDurationSec ?? totals.durationSec;

  if (plannedDistance > 0) {
    const dev = Math.abs(run.distanceMeters - plannedDistance) / plannedDistance;
    if (dev > DISTANCE_TOL) {
      return {
        matched: false,
        reason: `Distanz ${km(run.distanceMeters)} vs. Soll ${km(plannedDistance)} (${pct(dev)} ab)`,
      };
    }
    reasons.push(`Distanz ${km(run.distanceMeters)}≈${km(plannedDistance)}`);
  } else if (plannedDuration > 0) {
    const dev = Math.abs(run.durationSeconds - plannedDuration) / plannedDuration;
    if (dev > DISTANCE_TOL) {
      return {
        matched: false,
        reason: `Dauer ${min(run.durationSeconds)} vs. Soll ${min(plannedDuration)} (${pct(dev)} ab)`,
      };
    }
    reasons.push(`Dauer ${min(run.durationSeconds)}≈${min(plannedDuration)}`);
  } else {
    return { matched: false, reason: "Kein Soll (Distanz/Dauer) zum Vergleichen" };
  }

  // ---- 2. Struktur (nur wenn genug Laps zum Klassifizieren) ----
  // Eindeutig widerlegend ist NUR "geplant Intervalle, aber gleichmäßig
  // gelaufen" — dann wurde das Workout nicht gemacht. Der umgekehrte Fall
  // (geplanter Dauerlauf mit welligem Pace-Profil) ist bei Easy/Long durch
  // Terrain/Ampeln normal; dort entscheidet die HF, nicht die Pace-Streuung.
  const paces = validLapPaces(run.lapsJson);
  const plannedInterval = isPlannedInterval(blocks, paceZones);
  if (paces.length >= MIN_LAPS_FOR_STRUCTURE) {
    const actualInterval = coefficientOfVariation(paces) > STEADY_CV_MAX;
    if (plannedInterval && !actualInterval) {
      return {
        matched: false,
        reason: "Struktur: geplant Intervalle, aber gleichmäßig gelaufen",
      };
    }
    reasons.push(actualInterval ? "Struktur strukturiert" : "Struktur gleichmäßig");
  }

  // ---- 3. Intensität: locker → HF, Qualität → Pace ----
  const zone = zoneForSession(session);
  if (LOW_INTENSITY.has(session.sessionType)) {
    const intensity = checkEasyIntensity(run, zone, hrZones, paceZones);
    if (!intensity.ok) return { matched: false, reason: intensity.reason };
    reasons.push(intensity.reason);
  } else {
    const intensity = checkQualityIntensity(run, zone, paceZones);
    if (!intensity.ok) return { matched: false, reason: intensity.reason };
    reasons.push(intensity.reason);
  }

  return { matched: true, reason: reasons.join(" · ") };
}

// Locker: nicht zu HART gelaufen. Primär HF (Ø-HF ≤ Zonen-Obergrenze + Toleranz),
// Fallback Pace (nicht schneller als das schnelle Ende der Zone).
function checkEasyIntensity(
  run: MatchInput["run"],
  zone: number,
  hrZones: HrZones | null,
  paceZones: PaceZones | null,
): { ok: boolean; reason: string } {
  const hrCeil = hrZones?.[`z${zone}` as keyof HrZones]?.maxBpm ?? null;
  if (run.avgHeartRate != null && hrCeil != null) {
    const ok = run.avgHeartRate <= hrCeil + HR_TOL_BPM;
    return {
      ok,
      reason: `HF ${run.avgHeartRate} ${ok ? "≤" : ">"} ${hrCeil}+${HR_TOL_BPM} (Z${zone})`,
    };
  }
  // Fallback: Pace nicht (deutlich) schneller als das schnelle Zonen-Ende.
  const fast = paceZones?.[`z${zone}` as keyof PaceZones]?.minSec ?? null;
  if (run.avgPaceSecPerKm != null && fast != null) {
    const ok = run.avgPaceSecPerKm >= fast * (1 - QUALITY_PACE_TOL);
    return {
      ok,
      reason: `Pace ${pace(run.avgPaceSecPerKm)} ${ok ? "locker genug" : "zu schnell"} (Z${zone})`,
    };
  }
  // Weder HF noch Pace-Zone verfügbar → nicht widerlegbar, daher akzeptieren.
  return { ok: true, reason: "Intensität n/a (akzeptiert)" };
}

// Qualität: Work-Pace nahe am Ziel-Zonen-Band (± Toleranz).
function checkQualityIntensity(
  run: MatchInput["run"],
  zone: number,
  paceZones: PaceZones | null,
): { ok: boolean; reason: string } {
  const band = paceZones?.[`z${zone}` as keyof PaceZones] ?? null;
  if (!band) return { ok: true, reason: "Pace-Zone n/a (akzeptiert)" };
  const work = workPace(run.lapsJson) ?? run.avgPaceSecPerKm;
  if (work == null) return { ok: true, reason: "keine Pace-Daten (akzeptiert)" };
  const fast = band.minSec * (1 - QUALITY_PACE_TOL);
  const slow = band.maxSec * (1 + QUALITY_PACE_TOL);
  const ok = work >= fast && work <= slow;
  return {
    ok,
    reason: `Work-Pace ${pace(work)} ${ok ? "im" : "außerhalb"} Z${zone}-Band`,
  };
}

// Geplant strukturiert? reps>1 in irgendeinem Block ODER Splits-Modus ≠ "km".
function isPlannedInterval(blocks: SplitsBlock[], zones: PaceZones | null): boolean {
  if (blocks.some((b) => b.repetitions > 1)) return true;
  return buildSplits(blocks, zones).mode !== "km";
}

// Zone der Session: explizite primaryZone, sonst aus dem Typ.
function zoneForSession(
  session: MatchInput["session"],
): number {
  if (session.primaryZone != null) return session.primaryZone;
  switch (session.sessionType) {
    case "recovery":
      return 1;
    case "easy":
    case "long":
      return 2;
    case "tempo":
      return 3;
    case "threshold":
      return 4;
    case "vo2max":
      return 5;
    default:
      return 2;
  }
}

function validLapPaces(laps: RunLap[] | null): number[] {
  if (!laps) return [];
  const out: number[] = [];
  for (const l of laps) {
    const p =
      l.avgPaceSecPerKm ??
      (l.distanceMeters > 0 ? (l.durationSec / l.distanceMeters) * 1000 : null);
    if (p != null && p >= PACE_MIN && p <= PACE_MAX) out.push(p);
  }
  return out;
}

function coefficientOfVariation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean <= 0) return 0;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

// Work-Pace: dauer-gewichtete Ø-Pace der schnellsten Laps, die zusammen ~die
// Hälfte der Lauf-Dauer abdecken (Warm-/Cooldown fließen so nicht ein).
function workPace(laps: RunLap[] | null): number | null {
  const valid = (laps ?? []).filter((l) => {
    const p =
      l.avgPaceSecPerKm ??
      (l.distanceMeters > 0 ? (l.durationSec / l.distanceMeters) * 1000 : null);
    return p != null && p >= PACE_MIN && p <= PACE_MAX && l.durationSec > 0;
  });
  if (valid.length === 0) return null;
  const withPace = valid.map((l) => ({
    pace: (l.avgPaceSecPerKm ??
      (l.durationSec / l.distanceMeters) * 1000) as number,
    dur: l.durationSec,
  }));
  const totalDur = withPace.reduce((a, l) => a + l.dur, 0);
  const target = totalDur / 2;
  const sorted = [...withPace].sort((a, b) => a.pace - b.pace);
  let cum = 0;
  let weighted = 0;
  for (const l of sorted) {
    const take = Math.min(l.dur, target - cum);
    cum += take;
    weighted += l.pace * take;
    if (cum >= target) break;
  }
  return cum > 0 ? Math.round(weighted / cum) : null;
}

// ---- kleine Formatter für die reason-Strings (Logging) ----
function km(m: number): string {
  return `${(m / 1000).toFixed(1)}km`;
}
function min(sec: number): string {
  return `${Math.round(sec / 60)}min`;
}
function pace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
