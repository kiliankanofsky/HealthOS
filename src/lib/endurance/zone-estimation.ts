// ============================================================
// Endurance — Trainingszonen aus echten Lauf-Daten schätzen.
//
// Statt fixer Faktoren auf die LT2-Pace nutzen wir die Splits (laps_json)
// vergangener Läufe:
//
//   1. STEADY-LÄUFE (geringe Pace-Varianz über die Splits) liefern saubere
//      Pace↔HF-Datenpunkte. Eine dauer-gewichtete lineare Regression
//      (Speed [m/s] über HF) bildet das individuelle aerobe Profil ab —
//      daraus kommt die Pace für jede HF-Zonengrenze (%LTHR).
//   2. INTERVALLE taugen nicht für die HF-Beziehung (HF hinkt bei kurzen
//      Belastungen nach) — dort wird gerechnet: Die Work-Splits (deutlich
//      schneller als der Lauf-Median) liefern die schnellste kumulativ
//      ≥5 min gehaltene Pace als VO₂max-Anker (Z5). Die schnellste
//      kumulativ ≥20 min gehaltene Pace eines einzelnen Laufs dient als
//      Schwellen-Cross-Check.
//
// Die Funktionen sind pure (kein DB-Zugriff) — die Page lädt die Läufe und
// reicht das Ergebnis serialisiert an den Client-Calculator weiter, der die
// Zonen-Tabelle live aus Regression + LTHR-Eingabe ableitet.
// ============================================================

import type { RunLap } from "@/lib/db/schema";

export type RunForEstimation = {
  date: string;
  durationSeconds: number;
  lapsJson: RunLap[] | null;
};

export type SteadyLapPoint = {
  hr: number;
  durationSec: number;
};

export type PaceHrRegression = {
  /** speed [m/s] = intercept + slope · HF */
  slope: number;
  intercept: number;
  /** Gewichtetes Bestimmtheitsmaß des Fits. */
  r2: number;
};

export type ZoneEstimation = {
  fromIso: string;
  toIso: string;
  /** Läufe mit verwertbaren Splits im Fenster. */
  runCount: number;
  steadyRunCount: number;
  intervalRunCount: number;
  steadyLapCount: number;
  workLapCount: number;
  /** null, wenn die Datenlage für einen belastbaren Fit nicht reicht. */
  regression: PaceHrRegression | null;
  /** HF+Dauer der Steady-Splits — für die "beobachtete Minuten pro Zone"-Evidenz. */
  steadyLapPoints: SteadyLapPoint[];
  /** Schnellste kumulativ ≥5 min gehaltene Pace aus Intervall-Work-Splits (Z5-Anker). */
  vo2maxPaceSecPerKm: number | null;
  /** Schnellste kumulativ ≥20 min gehaltene Pace innerhalb EINES Laufs (Schwellen-Cross-Check). */
  best20minPaceSecPerKm: number | null;
};

// Plausibilitäts-Grenzen.
const PACE_MIN = 150; // 2:30/km
const PACE_MAX = 660; // 11:00/km
const HR_MIN = 95;
const HR_MAX = 215;

// Steady-Klassifikation: Variationskoeffizient der Lap-Paces.
const STEADY_CV_MAX = 0.06;
const STEADY_MIN_RUN_SEC = 20 * 60;

// Work-Split-Erkennung in strukturierten Läufen.
const WORK_FASTER_THAN_MEDIAN = 0.95;
const WORK_LAP_MIN_SEC = 60;
const WORK_LAP_MAX_SEC = 600;

// Mindest-Datenlage für die Regression.
const REGRESSION_MIN_POINTS = 10;
const REGRESSION_MIN_RUNS = 3;
const REGRESSION_MIN_HR_SPAN = 15;

type ValidLap = {
  paceSecPerKm: number;
  durationSec: number;
  hr: number | null;
};

function validLaps(laps: RunLap[] | null): ValidLap[] {
  if (!laps) return [];
  const out: ValidLap[] = [];
  for (const l of laps) {
    const pace =
      l.avgPaceSecPerKm ??
      (l.distanceMeters > 0 ? (l.durationSec / l.distanceMeters) * 1000 : null);
    if (pace == null || pace < PACE_MIN || pace > PACE_MAX) continue;
    if (l.durationSec < 45) continue;
    out.push({
      paceSecPerKm: pace,
      durationSec: l.durationSec,
      hr: l.avgHr != null && l.avgHr >= HR_MIN && l.avgHr <= HR_MAX ? l.avgHr : null,
    });
  }
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Dauer-gewichtete mittlere Pace der schnellsten Laps, bis die kumulierte
// Dauer `minTotalSec` erreicht. null, wenn die Laps zusammen nicht reichen.
function fastestCumulativePace(
  laps: { paceSecPerKm: number; durationSec: number }[],
  minTotalSec: number,
): number | null {
  const total = laps.reduce((acc, l) => acc + l.durationSec, 0);
  if (total < minTotalSec) return null;
  const sorted = [...laps].sort((a, b) => a.paceSecPerKm - b.paceSecPerKm);
  let cum = 0;
  let weighted = 0;
  for (const l of sorted) {
    // Nur so viel der Lap-Dauer mitnehmen, wie bis minTotalSec fehlt — sonst
    // verwässert eine lange langsame Schluss-Lap das Ergebnis.
    const take = Math.min(l.durationSec, minTotalSec - cum);
    cum += take;
    weighted += l.paceSecPerKm * take;
    if (cum >= minTotalSec) break;
  }
  return Math.round(weighted / cum);
}

export function estimateZonesFromRuns(
  runs: RunForEstimation[],
  fromIso: string,
  toIso: string,
): ZoneEstimation {
  let runCount = 0;
  let steadyRunCount = 0;
  let intervalRunCount = 0;
  const steadyPoints: SteadyLapPoint[] = [];
  // Speed-Datenpunkte für die Regression: (hr, m/s, Gewicht=Dauer).
  const regPoints: { hr: number; speed: number; w: number }[] = [];
  const workLaps: { paceSecPerKm: number; durationSec: number }[] = [];
  let best20min: number | null = null;

  for (const run of runs) {
    const laps = validLaps(run.lapsJson);
    if (laps.length < 3) continue;
    runCount++;

    const paces = laps.map((l) => l.paceSecPerKm);
    const mean = paces.reduce((a, b) => a + b, 0) / paces.length;
    const variance =
      paces.reduce((acc, p) => acc + (p - mean) ** 2, 0) / paces.length;
    const cv = Math.sqrt(variance) / mean;
    const totalSec = laps.reduce((acc, l) => acc + l.durationSec, 0);
    const isSteady = cv <= STEADY_CV_MAX && totalSec >= STEADY_MIN_RUN_SEC;

    // Schwellen-Cross-Check über alle Läufe (auch Intervall-Einheiten —
    // kumulativ schnellste ≥20 min innerhalb eines Laufs).
    const p20 = fastestCumulativePace(laps, 20 * 60);
    if (p20 != null && (best20min == null || p20 < best20min)) best20min = p20;

    if (isSteady) {
      steadyRunCount++;
      // Erste Lap überspringen: HF läuft beim Einlaufen der Pace hinterher
      // und würde den Fit nach "zu schnell bei niedriger HF" verzerren.
      for (const l of laps.slice(1)) {
        if (l.hr == null || l.durationSec < 120) continue;
        steadyPoints.push({ hr: l.hr, durationSec: l.durationSec });
        regPoints.push({
          hr: l.hr,
          speed: 1000 / l.paceSecPerKm,
          w: l.durationSec,
        });
      }
    } else {
      intervalRunCount++;
      const med = median(paces);
      for (const l of laps) {
        if (l.paceSecPerKm > med * WORK_FASTER_THAN_MEDIAN) continue;
        if (l.durationSec < WORK_LAP_MIN_SEC || l.durationSec > WORK_LAP_MAX_SEC)
          continue;
        workLaps.push({
          paceSecPerKm: l.paceSecPerKm,
          durationSec: l.durationSec,
        });
      }
    }
  }

  // ---- Gewichtete lineare Regression speed ~ HF ----
  let regression: PaceHrRegression | null = null;
  if (regPoints.length >= REGRESSION_MIN_POINTS && steadyRunCount >= REGRESSION_MIN_RUNS) {
    const hrs = regPoints.map((p) => p.hr);
    const hrSpan = Math.max(...hrs) - Math.min(...hrs);
    if (hrSpan >= REGRESSION_MIN_HR_SPAN) {
      let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
      for (const p of regPoints) {
        sw += p.w;
        swx += p.w * p.hr;
        swy += p.w * p.speed;
        swxx += p.w * p.hr * p.hr;
        swxy += p.w * p.hr * p.speed;
      }
      const meanX = swx / sw;
      const meanY = swy / sw;
      const denom = swxx - sw * meanX * meanX;
      if (Math.abs(denom) > 1e-9) {
        const slope = (swxy - sw * meanX * meanY) / denom;
        const intercept = meanY - slope * meanX;
        // Negative/Null-Steigung = Datenlage widerspricht der Physiologie
        // (mehr HF müsste mehr Speed bedeuten) → kein belastbarer Fit.
        if (slope > 0) {
          let ssRes = 0, ssTot = 0;
          for (const p of regPoints) {
            const pred = intercept + slope * p.hr;
            ssRes += p.w * (p.speed - pred) ** 2;
            ssTot += p.w * (p.speed - meanY) ** 2;
          }
          const r2 = ssTot > 1e-9 ? Math.max(0, 1 - ssRes / ssTot) : 0;
          regression = { slope, intercept, r2 };
        }
      }
    }
  }

  // ---- VO₂max-Anker aus Intervall-Work-Splits (kumulativ ≥5 min) ----
  const vo2maxPace = fastestCumulativePace(workLaps, 5 * 60);

  return {
    fromIso,
    toIso,
    runCount,
    steadyRunCount,
    intervalRunCount,
    steadyLapCount: steadyPoints.length,
    workLapCount: workLaps.length,
    regression,
    steadyLapPoints: steadyPoints,
    vo2maxPaceSecPerKm: vo2maxPace,
    best20minPaceSecPerKm: best20min,
  };
}

/** Pace (sec/km) bei einer HF laut Regression. null bei unplausiblem Ergebnis. */
export function paceAtHr(
  regression: PaceHrRegression,
  hr: number,
): number | null {
  const speed = regression.intercept + regression.slope * hr;
  if (speed <= 0.5) return null; // < 1,8 km/h — Extrapolation kaputt
  const pace = 1000 / speed;
  if (pace < 120 || pace > 720) return null;
  return Math.round(pace);
}
