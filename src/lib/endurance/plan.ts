import type { TrainingPlanPhase } from "@/lib/db/schema";
import { toLocalISODate } from "@/lib/utils/date";

// ============================================================
// Pace-Zonen aus dem Marathon-Ziel-Pace ableiten.
//
// Quelle: Referenzplan marathonplan1.pdf — Pace Guidelines für Sub-3h
// (Marathon-Pace = 4:15/km = 255 s/km):
//   Z1 Recovery   : 5:15–6:00/km   → MP+60 bis MP+105
//   Z2 Endurance  : 4:45–5:15/km   → MP+30 bis MP+60
//   Z3 Marathon   : 4:15/km        → MP±0 (als Band: MP-5 bis MP+5)
//   Z4 Threshold  : 4:00–4:10/km   → MP-15 bis MP-5
//   Z5 VO2 Max    : 3:45–3:55/km   → MP-30 bis MP-20
//
// Diese Offsets sind plausibel für andere Zielzeiten (gehen prozentual nicht
// ganz auf, aber Range ist groß genug für unsere Auflösung). User kann
// jeden Wert im Setup-Form überschreiben.
// ============================================================

export type PaceZones = {
  z1: { minSec: number; maxSec: number };
  z2: { minSec: number; maxSec: number };
  z3: { minSec: number; maxSec: number };
  z4: { minSec: number; maxSec: number };
  z5: { minSec: number; maxSec: number };
};

export function derivePaceZones(targetPaceSecPerKm: number): PaceZones {
  const mp = targetPaceSecPerKm;
  return {
    z1: { minSec: mp + 60, maxSec: mp + 105 },
    z2: { minSec: mp + 30, maxSec: mp + 60 },
    z3: { minSec: mp - 5, maxSec: mp + 5 },
    z4: { minSec: mp - 15, maxSec: mp - 5 },
    z5: { minSec: mp - 30, maxSec: mp - 20 },
  };
}

// Wandelt Sekunden pro Kilometer in "m:ss" (oder "m:ss/km" mit withUnit).
// Akzeptiert null/undefined und liefert dann "—" — die Endurance-Stats werden
// oft aus optionalen Daten gefüttert (Garmin-Felder können null sein).
export function formatPace(
  secPerKm: number | null | undefined,
  options: { withUnit?: boolean } = {},
): string {
  if (secPerKm == null) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  const base = `${m}:${String(s).padStart(2, "0")}`;
  return options.withUnit ? `${base}/km` : base;
}

// "hh:mm:ss" oder "h:mm:ss" → Sekunden. Wirft bei ungültigem Format.
export function parseHmsToSeconds(input: string): number {
  const parts = input.trim().split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error("Ungültige Zeitangabe.");
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }
  throw new Error("Zeit muss als h:mm:ss oder m:ss vorliegen.");
}

// Sekunden → "h:mm:ss" (oder "m:ss" wenn unter einer Stunde).
// Akzeptiert null/undefined → "—" (gleiche Begründung wie formatPace).
export function formatSecondsAsHms(totalSec: number | null | undefined): string {
  if (totalSec == null) return "—";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ============================================================
// Plan-Wochen aus Race-Datum + totalWeeks generieren.
//
// Konvention: Race-Tag ist der Sonntag der letzten Woche (Race-Woche).
// weekNumber 1 = erste Woche des Plans (planStartDate),
// weekNumber totalWeeks = Race-Woche.
//
// Die Phasen-Defaults orientieren sich am Referenzplan (16 Wochen):
//   1-4   base
//   5-9   build
//   10-12 peak
//   13-15 taper
//   16    race
// Bei abweichendem totalWeeks skalieren wir proportional.
// ============================================================

export type PlanWeekSlot = {
  weekNumber: number;
  startDate: string; // ISO YYYY-MM-DD, Montag
  endDate: string; // ISO YYYY-MM-DD, Sonntag
  phase: TrainingPlanPhase;
};

// Verschiebt ein Datum so, dass es auf den Montag derselben (ISO-)Woche zeigt.
function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // 0=Mon, 6=Sun
  d.setDate(d.getDate() - dow);
  return d;
}

// Default-Phasen-Verteilung als Anteile (kumuliert summieren sich auf 1.0).
// 16w: 0.25 base, 0.3125 build (5-9), 0.1875 peak (10-12), 0.1875 taper (13-15), 1w race.
function phaseForWeek(weekNumber: number, totalWeeks: number): TrainingPlanPhase {
  if (weekNumber === totalWeeks) return "race";
  // Skalierte Grenzen (Referenz: 16 Wochen → 4/9/12/15/16).
  const baseEnd = Math.round((4 / 16) * totalWeeks);
  const buildEnd = Math.round((9 / 16) * totalWeeks);
  const peakEnd = Math.round((12 / 16) * totalWeeks);
  // Taper läuft bis totalWeeks - 1 (race-Woche separat).
  if (weekNumber <= baseEnd) return "base";
  if (weekNumber <= buildEnd) return "build";
  if (weekNumber <= peakEnd) return "peak";
  return "taper";
}

// Ziel-Wochenvolumen (km) als deterministische Richtgröße für die KI.
// Kontinuierlicher Aufbau Base→Build, Peak-Plateau, danach 2–3 Wochen Taper,
// Race-Woche reduziert. Liefert null, wenn kein Peak-Volumen gesetzt ist
// (dann darf die KI selbst eine sinnvolle Progression wählen).
//
// Performance-Science-Logik: progressive Overload bis Peak, dann Erholung
// (Superkompensation) vor dem Wettkampf — kein Sägezahn, kein Volumen-Sprung.
export function targetWeeklyKm(
  weekNumber: number,
  totalWeeks: number,
  peakKm: number | null | undefined,
): number | null {
  if (!peakKm || peakKm <= 0) return null;
  const buildEnd = Math.round((9 / 16) * totalWeeks);
  const peakEnd = Math.round((12 / 16) * totalWeeks);

  // Race-Woche: stark reduziert (nur Pre-Race-Aktivierung + Race).
  if (weekNumber === totalWeeks) return Math.round(peakKm * 0.4);

  // Taper-Wochen (nach Peak-Phase bis zur vorletzten Woche): 0.80 → 0.55.
  if (weekNumber > peakEnd) {
    const taperWeeks = totalWeeks - 1 - peakEnd;
    const idx = weekNumber - peakEnd; // 1..taperWeeks
    const frac =
      taperWeeks <= 1 ? 0.65 : 0.8 - ((idx - 1) / (taperWeeks - 1)) * (0.8 - 0.55);
    return Math.round(peakKm * frac);
  }

  // Peak-Phase: Plateau bei 100 %.
  if (weekNumber > buildEnd) return Math.round(peakKm);

  // Base + Build: linearer Aufbau 0.65 → 0.95.
  const frac =
    0.65 + ((weekNumber - 1) / Math.max(1, buildEnd - 1)) * (0.95 - 0.65);
  return Math.round(peakKm * frac);
}

export function computePlanWeeks(
  raceDateIso: string,
  totalWeeks: number,
): { planStartDate: string; weeks: PlanWeekSlot[] } {
  if (totalWeeks < 1) {
    throw new Error("totalWeeks muss >= 1 sein.");
  }
  const raceDate = new Date(`${raceDateIso}T00:00:00`);
  if (Number.isNaN(raceDate.getTime())) {
    throw new Error("Ungültiges Race-Datum.");
  }
  // Race-Woche endet am Sonntag, in dem das Race-Datum liegt.
  // raceWeekMonday = Montag der Woche, in der das Race liegt.
  const raceWeekMonday = mondayOf(raceDate);
  const weeks: PlanWeekSlot[] = [];
  for (let n = 1; n <= totalWeeks; n++) {
    const offset = (totalWeeks - n) * 7;
    const monday = new Date(raceWeekMonday);
    monday.setDate(raceWeekMonday.getDate() - offset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    weeks.push({
      weekNumber: n,
      startDate: toLocalISODate(monday),
      endDate: toLocalISODate(sunday),
      phase: phaseForWeek(n, totalWeeks),
    });
  }
  return {
    planStartDate: weeks[0].startDate,
    weeks,
  };
}
