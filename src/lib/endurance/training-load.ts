// ============================================================
// Phase 4 Sprint 5.1 — Fitness / Fatigue / Form aus Garmins Training Load.
//
// Performance-Management-Modell (TrainingPeaks-Stil):
//   CTL (Chronic Training Load)  = "Fitness"  — EWMA über 42 Tage
//   ATL (Acute Training Load)    = "Fatigue"  — EWMA über 7 Tage
//   TSB (Training Stress Balance)= "Form"     = CTL_gestern − ATL_gestern
//
// Tages-Load = Summe der `trainingLoad`-Werte aller Läufe des Tages
// (Garmin liefert das pro Aktivität). Tage ohne Lauf → Load 0 (Erholung
// lässt die Werte abklingen). Reine Funktion, keine DB/IO.
// ============================================================

const CTL_TAU = 42;
const ATL_TAU = 7;

export type LoadRun = { date: string; trainingLoad: number | null };
export type FitnessSnapshot = { ctl: number; atl: number; tsb: number };
export type FitnessResult = {
  current: FitnessSnapshot;
  fourWeeksAgo: FitnessSnapshot | null;
  // Anzahl Tage mit Trainingsdaten, die in die Berechnung einflossen.
  daysCovered: number;
};

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeFitness(runs: LoadRun[], todayIso: string): FitnessResult {
  const byDate = new Map<string, number>();
  for (const r of runs) {
    if (r.trainingLoad == null) continue;
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.trainingLoad);
  }
  if (byDate.size === 0) {
    return { current: { ctl: 0, atl: 0, tsb: 0 }, fourWeeksAgo: null, daysCovered: 0 };
  }

  const startIso = [...byDate.keys()].sort()[0];
  const fourAgoIso = (() => {
    const d = new Date(`${todayIso}T00:00:00`);
    d.setDate(d.getDate() - 28);
    return toIso(d);
  })();

  let ctl = 0;
  let atl = 0;
  const snapshots = new Map<string, FitnessSnapshot>();

  const cursor = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${todayIso}T00:00:00`);
  while (cursor <= end) {
    const iso = toIso(cursor);
    const load = byDate.get(iso) ?? 0;
    // Form = Fitness/Fatigue, die man IN den Tag mitbringt (Vortageswerte).
    const tsb = ctl - atl;
    ctl = ctl + (load - ctl) / CTL_TAU;
    atl = atl + (load - atl) / ATL_TAU;
    snapshots.set(iso, { ctl: Math.round(ctl), atl: Math.round(atl), tsb: Math.round(tsb) });
    cursor.setDate(cursor.getDate() + 1);
  }

  const lastIso = toIso(end);
  const current = snapshots.get(lastIso) ?? { ctl: Math.round(ctl), atl: Math.round(atl), tsb: Math.round(ctl - atl) };
  const fourWeeksAgo = snapshots.get(fourAgoIso) ?? null;

  return { current, fourWeeksAgo, daysCovered: byDate.size };
}
