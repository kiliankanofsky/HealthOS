import type { TrainingPlanPhase } from "@/lib/db/schema";

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

// Wandelt Sekunden pro Kilometer in "m:ss/km" für die Anzeige.
export function formatPace(secPerKm: number): string {
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.round(secPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
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

export function formatSecondsAsHms(totalSec: number): string {
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

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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
      startDate: isoDate(monday),
      endDate: isoDate(sunday),
      phase: phaseForWeek(n, totalWeeks),
    });
  }
  return {
    planStartDate: weeks[0].startDate,
    weeks,
  };
}
