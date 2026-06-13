// ============================================================
// Endurance — konsolidierte Trainingszonen aus mehreren Datenquellen.
//
// Modell: 5 Zonen, LTHR-verankert nach Joe Friel (Running):
//   Z1 Recovery   < 85 % LTHR
//   Z2 Endurance  85–89 %
//   Z3 Tempo      90–94 %
//   Z4 Threshold  95–99 %
//   Z5 VO₂ Max    ≥ 100 % LTHR (Friels 5a/5b/5c zusammengefasst)
//
// Schwellen-Pace wird aus drei Quellen konsolidiert (Median):
//   A) Garmin LT2-Pace (Algorithmus)
//   B) Empirisch via Pace↔HF-Regression aus Steady-Splits (Pace bei HF=LTHR)
//   C) Beste 20-min-Pace innerhalb eines Laufs (Race-/Tempolauf-Surrogat)
//
// Pace-Zonen werden, wenn eine belastbare Regression vorliegt, direkt aus
// der Regression abgeleitet (paceAtHr für die HF-Grenzen) — sonst über
// Friel-Faktoren auf die konsolidierte Schwellen-Pace.
// Z5-Pace kommt aus Intervall-Work-Splits (kumulativ ≥ 5 min, schnellste).
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

export type PaceSource = "garmin" | "regression" | "best20";

export type ThresholdPaceEstimate = {
  /** Konsolidierte Schwellen-Pace (sec/km) — Median über alle vorhandenen Quellen. */
  paceSecPerKm: number;
  /** Welche Quellen haben dazu beigetragen? */
  sources: PaceSource[];
  /** Einzelwerte pro Quelle für den Tooltip. */
  garminPace: number | null;
  regressionPace: number | null;
  best20Pace: number | null;
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
  /** Schnellste kumulativ ≥20 min gehaltene Pace innerhalb EINES Laufs. */
  best20minPaceSecPerKm: number | null;
  /** Konsolidierte Schwellen-Pace + Quellen-Aufschlüsselung. null bei zu dünner Datenlage. */
  thresholdPace: ThresholdPaceEstimate | null;
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

// Friel-HF-Zonen (% LTHR) für Running.
export type FrielZone = {
  zone: "Z1" | "Z2" | "Z3" | "Z4" | "Z5";
  name: string;
  description: string;
  /** Untergrenze HF-% LTHR (null = offen nach unten). */
  hrPctLow: number | null;
  /** Obergrenze HF-% LTHR (null = offen nach oben). */
  hrPctHigh: number | null;
  /** Faktor auf die Schwellen-Pace für die SCHNELLE Grenze der Zone (null = offen). */
  paceFactorFast: number | null;
  /** Faktor auf die Schwellen-Pace für die LANGSAME Grenze. */
  paceFactorSlow: number | null;
};

export const FRIEL_ZONES: FrielZone[] = [
  {
    zone: "Z1",
    name: "Recovery",
    description: "Regeneration, sehr lockerer Dauerlauf",
    hrPctLow: null,
    hrPctHigh: 84,
    paceFactorFast: 1.29,
    paceFactorSlow: null,
  },
  {
    zone: "Z2",
    name: "Endurance",
    description: "Grundlagenausdauer, Long Runs",
    hrPctLow: 85,
    hrPctHigh: 89,
    paceFactorFast: 1.14,
    paceFactorSlow: 1.29,
  },
  {
    zone: "Z3",
    name: "Tempo",
    description: "Marathon-/Half-Marathon-Effort",
    hrPctLow: 90,
    hrPctHigh: 94,
    paceFactorFast: 1.06,
    paceFactorSlow: 1.13,
  },
  {
    zone: "Z4",
    name: "Threshold",
    description: "Schwellentempo (≈ 10 km/Stunden-Race)",
    hrPctLow: 95,
    hrPctHigh: 99,
    paceFactorFast: 1.0,
    paceFactorSlow: 1.05,
  },
  {
    zone: "Z5",
    name: "VO₂ Max",
    description: "Intervalle 3–8 min, anaerob nahe Maximum",
    hrPctLow: 100,
    hrPctHigh: null,
    paceFactorFast: 0.9,
    paceFactorSlow: 0.99,
  },
];

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
  options: { garminLtPaceSecPerKm: number | null; lthr: number | null } = {
    garminLtPaceSecPerKm: null,
    lthr: null,
  },
): ZoneEstimation {
  let runCount = 0;
  let steadyRunCount = 0;
  let intervalRunCount = 0;
  const steadyPoints: SteadyLapPoint[] = [];
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

    const p20 = fastestCumulativePace(laps, 20 * 60);
    if (p20 != null && (best20min == null || p20 < best20min)) best20min = p20;

    if (isSteady) {
      steadyRunCount++;
      // Erste Lap überspringen: HF läuft beim Einlaufen der Pace hinterher.
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

  const vo2maxPace = fastestCumulativePace(workLaps, 5 * 60);

  // ---- Konsolidierte Schwellen-Pace ----
  const regressionPace =
    regression != null && options.lthr != null
      ? paceAtHr(regression, options.lthr)
      : null;
  const thresholdPace = consolidateThresholdPace({
    garminPace: options.garminLtPaceSecPerKm,
    regressionPace,
    best20Pace: best20min,
  });

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
    thresholdPace,
  };
}

function consolidateThresholdPace(input: {
  garminPace: number | null;
  regressionPace: number | null;
  best20Pace: number | null;
}): ThresholdPaceEstimate | null {
  const values: { source: PaceSource; value: number }[] = [];
  if (input.garminPace != null) values.push({ source: "garmin", value: input.garminPace });
  if (input.regressionPace != null)
    values.push({ source: "regression", value: input.regressionPace });
  if (input.best20Pace != null) values.push({ source: "best20", value: input.best20Pace });
  if (values.length === 0) return null;

  const med = median(values.map((v) => v.value));
  return {
    paceSecPerKm: Math.round(med),
    sources: values.map((v) => v.source),
    garminPace: input.garminPace,
    regressionPace: input.regressionPace,
    best20Pace: input.best20Pace,
  };
}

/** Pace (sec/km) bei einer HF laut Regression. null bei unplausiblem Ergebnis. */
export function paceAtHr(
  regression: PaceHrRegression,
  hr: number,
): number | null {
  const speed = regression.intercept + regression.slope * hr;
  if (speed <= 0.5) return null;
  const pace = 1000 / speed;
  if (pace < 120 || pace > 720) return null;
  return Math.round(pace);
}

// ---- Pro-Zone Ableitung ----

export type ZoneRow = {
  zone: FrielZone;
  /** HF-Untergrenze (bpm) — null wenn offen nach unten. */
  hrLow: number | null;
  /** HF-Obergrenze (bpm) — null wenn offen nach oben. */
  hrHigh: number | null;
  /** Pace (sec/km) am schnellen Ende der Zone — null wenn offen. */
  paceFast: number | null;
  /** Pace (sec/km) am langsamen Ende der Zone — null wenn offen. */
  paceSlow: number | null;
  /** Beobachtete Steady-Minuten in dieser HF-Zone. */
  evidenceMinutes: number;
  /** Welche Quelle hat die Pace-Range geliefert? */
  paceSource: "regression" | "factor" | "vo2max-anchor" | null;
};

export function buildZoneRows(
  estimation: ZoneEstimation,
  lthr: number | null,
): ZoneRow[] {
  return FRIEL_ZONES.map((z) => {
    const hrLow = z.hrPctLow != null && lthr != null
      ? Math.round((lthr * z.hrPctLow) / 100)
      : null;
    const hrHigh = z.hrPctHigh != null && lthr != null
      ? Math.round((lthr * z.hrPctHigh) / 100)
      : null;

    let paceFast: number | null = null;
    let paceSlow: number | null = null;
    let paceSource: ZoneRow["paceSource"] = null;

    if (z.zone === "Z5") {
      // Z5 kommt aus Intervall-Splits — Regression extrapoliert oberhalb der
      // Schwelle schlecht.
      paceSlow = estimation.thresholdPace?.paceSecPerKm ?? null;
      paceFast =
        estimation.vo2maxPaceSecPerKm ??
        (paceSlow != null ? Math.round(paceSlow * 0.92) : null);
      paceSource = estimation.vo2maxPaceSecPerKm != null ? "vo2max-anchor" : "factor";
    } else if (estimation.regression != null && hrLow != null && hrHigh != null) {
      paceFast = paceAtHr(estimation.regression, hrHigh);
      paceSlow = paceAtHr(estimation.regression, hrLow);
      paceSource = "regression";
    } else if (estimation.thresholdPace != null) {
      const tp = estimation.thresholdPace.paceSecPerKm;
      paceFast = z.paceFactorFast != null ? Math.round(tp * z.paceFactorFast) : null;
      paceSlow = z.paceFactorSlow != null ? Math.round(tp * z.paceFactorSlow) : null;
      paceSource = "factor";
    } else if (estimation.regression != null) {
      // Nur eine HF-Grenze vorhanden (Z1 unten offen, Z5 oben offen).
      if (hrHigh != null) paceFast = paceAtHr(estimation.regression, hrHigh);
      if (hrLow != null) paceSlow = paceAtHr(estimation.regression, hrLow);
      paceSource = "regression";
    }

    let evidenceSec = 0;
    for (const p of estimation.steadyLapPoints) {
      if (hrLow != null && p.hr < hrLow) continue;
      if (hrHigh != null && p.hr > hrHigh) continue;
      evidenceSec += p.durationSec;
    }

    return {
      zone: z,
      hrLow,
      hrHigh,
      paceFast,
      paceSlow,
      evidenceMinutes: Math.round(evidenceSec / 60),
      paceSource,
    };
  });
}
