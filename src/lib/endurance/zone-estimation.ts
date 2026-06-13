// ============================================================
// Endurance — HYBRIDES 5-Zonen-Trainingszonenmodell, datenabgeleitet.
//
// Zweck-benannte Zonen im LT1/LT2-Gerüst (LT2 = Garmin-LTHR):
//   Z1 Recovery   ≤ 80 % LTHR   (weit unter LT1)        — STEUERN NACH HF
//   Z2 Endurance  81–89 % LTHR  (bis LT1)               — STEUERN NACH HF
//   Z3 Marathon   90–94 % LTHR  (LT1–LT2)               — STEUERN NACH PACE
//   Z4 Threshold  95–100 % LTHR (um LT2)                — STEUERN NACH PACE
//   Z5 VO₂max     ≥ 101 % LTHR  (über LT2)              — STEUERN NACH PACE
//
// Hybrid-Idee: HF ist im LOCKEREN Bereich der verlässliche Steuerwert (Pace
// schwankt mit Terrain/Wind), Pace im QUALITÄTS-Bereich (HF hinkt bei kurzen
// Intervallen nach + driftet). Darum wird die PACE pro Zone aus der jeweils
// passendsten Quelle abgeleitet — alles aus den echten Daten:
//   • Z1/Z2: BEOBACHTET — Steady-Splits nach eigener Ø-HF in die Zonen gebinnt,
//     dauer-gewichtete 25.–75.-Perzentil-Spanne → realistische Easy/Recovery.
//   • Z3 Marathon: Garmin-Marathon-Prognose ÷ 42,195 km, konsolidiert mit
//     beobachteter Pace im Z3-HF-Band; optional per Ziel-MP überschrieben.
//   • Z4 Threshold: konsolidierte Schwellen-Pace (Garmin LT2 etc.) × Faktor.
//   • Z5 VO₂max: schnellste kumulativ ≥ 5 min gehaltene Intervall-Work-Pace.
//   Fallback überall: Regression (nur bei gutem Fit) bzw. Schwellen-Pace×Faktor.
//
// HEURISTIK Steady vs. Intervall (wie vom Nutzer gewünscht):
//   • Steady-Läufe (geringe Pace-Streuung) → ALLE Splits fließen HF-gebinnt in
//     die Beobachtung ein (saubere HF↔Pace-Kopplung).
//   • Intervall-/strukturierte Läufe → NUR die Work-Splits zählen (für Z5).
//     Die Durchschnitts-Pace eines Intervall-Laufs wird NIE als ein Datenpunkt
//     verwendet, und die HF-verzögerten Trab-Pausen verfälschen die Easy-Zonen
//     nicht.
//
// Schwellen-Pace (Z4-Anker) wird aus drei Quellen konsolidiert (Median):
//   A) Garmin LT2-Pace · B) Regression @ LTHR (nur r²-OK) · C) Best-20-min.
//
// Alles LTHR-verankert und zu EINEM Datensatz (ZoneEstimation) konsolidiert.
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
  /** Ø-Pace des Splits (sec/km) — für die beobachtete Pace pro HF-Zone. */
  paceSecPerKm: number;
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

export type MarathonPaceSource = "garmin-pred" | "observed";

export type MarathonPaceEstimate = {
  /** Konsolidierte Marathon-Pace (sec/km) — Median der vorhandenen Quellen. */
  paceSecPerKm: number;
  sources: MarathonPaceSource[];
  /** Garmin-Marathon-Prognose ÷ 42,195 km. */
  garminPredPace: number | null;
  /** Beobachtete Pace im Z3-HF-Band aus Steady-MP-Effort-Splits. */
  observedPace: number | null;
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
  /** Konsolidierte Marathon-Pace (Z3-Anker) — Garmin-Prognose + beobachtet. null wenn beides fehlt. */
  marathonPace: MarathonPaceEstimate | null;
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
// Mindest-Fit-Güte: eine Regression mit miserablem r² (z.B. nur Easy-Splits in
// enger HF-Spanne) erklärt HF↔Pace nicht und liefert beim Extrapolieren auf
// die Schwellen-HF völlig falsche Zonen-Paces. Dann lieber gar nicht nutzen —
// die Faktor-Methode auf die (verlässliche) Garmin-Schwellen-Pace ist robuster.
const REGRESSION_MIN_R2 = 0.3;

// Steuer-Metrik pro Zone: HF (locker) vs. Pace (Qualität).
export type ZoneAnchor = "hr" | "pace";

// Hybride Zweck-Zonen im LT1/LT2-Gerüst (% LTHR, LT2 = Garmin-LTHR).
export type HybridZone = {
  zone: "Z1" | "Z2" | "Z3" | "Z4" | "Z5";
  name: string;
  description: string;
  /** Primäre Steuer-Metrik der Zone. */
  anchor: ZoneAnchor;
  /** Untergrenze HF-% LTHR (null = offen nach unten). */
  hrPctLow: number | null;
  /** Obergrenze HF-% LTHR (null = offen nach oben). */
  hrPctHigh: number | null;
  /** Faktor auf die Schwellen-Pace für die SCHNELLE Grenze (Fallback). */
  paceFactorFast: number | null;
  /** Faktor auf die Schwellen-Pace für die LANGSAME Grenze (Fallback). */
  paceFactorSlow: number | null;
};

export const HYBRID_ZONES: HybridZone[] = [
  {
    zone: "Z1",
    name: "Recovery",
    description: "Regeneration, sehr lockerer Trab — deutlich unter LT1",
    anchor: "hr",
    hrPctLow: null,
    hrPctHigh: 80,
    // Daniels: Easy/Recovery ist ~15–45 % langsamer als die Schwelle. Der
    // langsame Rand (1,45) hält Recovery im Faktor-Fallback langsam; Regelfall
    // ist ohnehin die BEOBACHTETE Pace.
    paceFactorFast: 1.29,
    paceFactorSlow: 1.45,
  },
  {
    zone: "Z2",
    name: "Endurance",
    description: "Grundlagenausdauer & Long Runs — bis zur aeroben Schwelle (LT1)",
    anchor: "hr",
    hrPctLow: 81,
    hrPctHigh: 89,
    paceFactorFast: 1.14,
    paceFactorSlow: 1.29,
  },
  {
    zone: "Z3",
    name: "Marathon",
    description: "Marathon-Renntempo — zwischen aerober (LT1) und anaerober (LT2) Schwelle",
    anchor: "pace",
    hrPctLow: 90,
    hrPctHigh: 94,
    // Fallback, falls keine Marathon-Prognose/Beobachtung vorliegt: MP ist
    // ~9–17 % langsamer als die Schwelle.
    paceFactorFast: 1.09,
    paceFactorSlow: 1.17,
  },
  {
    zone: "Z4",
    name: "Threshold",
    description: "Schwellentempo — um die anaerobe Schwelle (LT2 ≈ Garmin-LTHR)",
    anchor: "pace",
    hrPctLow: 95,
    hrPctHigh: 100,
    paceFactorFast: 0.98,
    paceFactorSlow: 1.04,
  },
  {
    zone: "Z5",
    name: "VO₂max",
    description: "Intervalle, anaerob über der Schwelle (LT2)",
    anchor: "pace",
    hrPctLow: 101,
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

// Dauer-gewichtetes Perzentil (q ∈ [0,1]) einer (value, weight)-Reihe.
// Für Pace-Spannen pro Zone: q=0.25 ≈ schneller Rand, q=0.75 ≈ langsamer Rand.
function weightedPercentile(
  points: { value: number; weight: number }[],
  q: number,
): number {
  const sorted = [...points].sort((a, b) => a.value - b.value);
  const totalW = sorted.reduce((acc, p) => acc + p.weight, 0);
  if (totalW <= 0) return sorted[0]?.value ?? 0;
  const target = q * totalW;
  let cum = 0;
  for (const p of sorted) {
    cum += p.weight;
    if (cum >= target) return p.value;
  }
  return sorted[sorted.length - 1].value;
}

// Mindest-Datenlage, damit eine Zone ihre Pace BEOBACHTET (statt geschätzt) bekommt.
const OBSERVED_MIN_SEC = 8 * 60; // ≥ 8 min gebinnt
const OBSERVED_MIN_POINTS = 2;

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

// Z3-HF-Band (% LTHR), in dem MP-Effort-Splits beobachtet werden — muss zum
// Z3-Eintrag in HYBRID_ZONES passen.
const Z3_HR_PCT_LOW = 90;
const Z3_HR_PCT_HIGH = 94;
const MARATHON_DISTANCE_KM = 42.195;

export function estimateZonesFromRuns(
  runs: RunForEstimation[],
  fromIso: string,
  toIso: string,
  options: {
    garminLtPaceSecPerKm: number | null;
    lthr: number | null;
    /** Garmin-Marathon-Renn-Prognose (Sekunden) — wird zur Z3-Pace ÷ 42,195 km. */
    marathonPredSec?: number | null;
  } = {
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
        steadyPoints.push({
          hr: l.hr,
          durationSec: l.durationSec,
          paceSecPerKm: l.paceSecPerKm,
        });
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
          // Nur ein belastbarer Fit darf die Zonen-Pace bestimmen.
          if (r2 >= REGRESSION_MIN_R2) regression = { slope, intercept, r2 };
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

  // ---- Konsolidierte Marathon-Pace (Z3-Anker) ----
  const garminPredPace =
    options.marathonPredSec != null && options.marathonPredSec > 0
      ? Math.round(options.marathonPredSec / MARATHON_DISTANCE_KM)
      : null;
  const observedMpPace =
    options.lthr != null
      ? observedPaceInHrBand(
          steadyPoints,
          Math.round((options.lthr * Z3_HR_PCT_LOW) / 100),
          Math.round((options.lthr * Z3_HR_PCT_HIGH) / 100),
        )
      : null;
  const marathonPace = consolidateMarathonPace(garminPredPace, observedMpPace);

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
    marathonPace,
  };
}

/** Dauer-gewichtete Median-Pace der Steady-Splits in einem HF-Band — null bei zu dünner Lage. */
function observedPaceInHrBand(
  points: SteadyLapPoint[],
  hrLow: number,
  hrHigh: number,
): number | null {
  const inBand = points.filter((p) => p.hr >= hrLow && p.hr <= hrHigh);
  const totalSec = inBand.reduce((acc, p) => acc + p.durationSec, 0);
  if (totalSec < OBSERVED_MIN_SEC || inBand.length < OBSERVED_MIN_POINTS) return null;
  return Math.round(
    weightedPercentile(
      inBand.map((p) => ({ value: p.paceSecPerKm, weight: p.durationSec })),
      0.5,
    ),
  );
}

function consolidateMarathonPace(
  garminPredPace: number | null,
  observedPace: number | null,
): MarathonPaceEstimate | null {
  const values: { source: MarathonPaceSource; value: number }[] = [];
  if (garminPredPace != null) values.push({ source: "garmin-pred", value: garminPredPace });
  if (observedPace != null) values.push({ source: "observed", value: observedPace });
  if (values.length === 0) return null;
  return {
    paceSecPerKm: Math.round(median(values.map((v) => v.value))),
    sources: values.map((v) => v.source),
    garminPredPace,
    observedPace,
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

export type PaceSourceKind =
  | "observed"
  | "regression"
  | "factor"
  | "vo2max-anchor"
  | "garmin-marathon"
  | "goal";

export type ZoneRow = {
  zone: HybridZone;
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
  paceSource: PaceSourceKind | null;
};

type PaceBand = { fast: number | null; slow: number | null; source: PaceSourceKind };

// Band um eine Punkt-Pace (Z3-Anker) — ±3 %.
function bandAround(p: number, source: PaceSourceKind): PaceBand {
  return { fast: Math.round(p * 0.97), slow: Math.round(p * 1.03), source };
}

export function buildZoneRows(
  estimation: ZoneEstimation,
  lthr: number | null,
  opts: { goalMpSecPerKm?: number | null } = {},
): ZoneRow[] {
  return HYBRID_ZONES.map((z) => {
    const hrLow = z.hrPctLow != null && lthr != null
      ? Math.round((lthr * z.hrPctLow) / 100)
      : null;
    const hrHigh = z.hrPctHigh != null && lthr != null
      ? Math.round((lthr * z.hrPctHigh) / 100)
      : null;

    // Steady-Splits, deren Ø-HF in diese Zone fällt — Basis für die beobachtete
    // Pace UND die Evidenz-Minuten.
    const inZone = estimation.steadyLapPoints.filter(
      (p) =>
        (hrLow == null || p.hr >= hrLow) && (hrHigh == null || p.hr <= hrHigh),
    );
    const evidenceSec = inZone.reduce((acc, p) => acc + p.durationSec, 0);

    const observed = (): PaceBand | null => {
      if (evidenceSec < OBSERVED_MIN_SEC || inZone.length < OBSERVED_MIN_POINTS)
        return null;
      const pts = inZone.map((p) => ({ value: p.paceSecPerKm, weight: p.durationSec }));
      return {
        fast: Math.round(weightedPercentile(pts, 0.25)),
        slow: Math.round(weightedPercentile(pts, 0.75)),
        source: "observed",
      };
    };
    const regression = (): PaceBand | null =>
      estimation.regression != null && (hrLow != null || hrHigh != null)
        ? {
            fast: hrHigh != null ? paceAtHr(estimation.regression, hrHigh) : null,
            slow: hrLow != null ? paceAtHr(estimation.regression, hrLow) : null,
            source: "regression",
          }
        : null;
    const factor = (): PaceBand | null =>
      estimation.thresholdPace != null
        ? {
            fast: z.paceFactorFast != null
              ? Math.round(estimation.thresholdPace.paceSecPerKm * z.paceFactorFast)
              : null,
            slow: z.paceFactorSlow != null
              ? Math.round(estimation.thresholdPace.paceSecPerKm * z.paceFactorSlow)
              : null,
            source: "factor",
          }
        : null;

    // Pro Zone die passendste Quelle (Prioritäts-Kaskade).
    let band: PaceBand | null = null;
    switch (z.zone) {
      case "Z1":
      case "Z2":
        // HF-gesteuert: echte Easy-Splits zuerst.
        band = observed() ?? regression() ?? factor();
        break;
      case "Z3":
        // Marathon: Ziel-Override → Garmin-/beobachtete Marathon-Pace → Band aus
        // Steady-Splits → Faktor.
        band =
          (opts.goalMpSecPerKm != null ? bandAround(opts.goalMpSecPerKm, "goal") : null) ??
          (estimation.marathonPace != null
            ? bandAround(estimation.marathonPace.paceSecPerKm, "garmin-marathon")
            : null) ??
          observed() ??
          factor();
        break;
      case "Z4":
        // Threshold: an der (verlässlichen) konsolidierten Schwellen-Pace.
        band = factor() ?? observed() ?? regression();
        break;
      case "Z5":
        // VO₂max: aus Intervall-Work-Splits; sonst Faktor.
        band =
          estimation.vo2maxPaceSecPerKm != null
            ? {
                fast: estimation.vo2maxPaceSecPerKm,
                slow: estimation.thresholdPace?.paceSecPerKm ?? null,
                source: "vo2max-anchor",
              }
            : factor();
        break;
    }

    return {
      zone: z,
      hrLow,
      hrHigh,
      paceFast: band?.fast ?? null,
      paceSlow: band?.slow ?? null,
      evidenceMinutes: Math.round(evidenceSec / 60),
      paceSource: band?.source ?? null,
    };
  });
}
