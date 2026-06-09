// ============================================================
// Splits-Ableitung für die Session-Card (Sprint 4.1).
//
// Wandelt die Block/Segment-Struktur einer GEPLANTEN Session in eine Liste
// von "Splits" für die Balken-Grafik um:
//   - Dauerläufe (alle Blocks reps=1)  → gruppiert pro KILOMETER
//   - Intervalle  (irgendein reps>1)   → gruppiert pro RUNDE (Segment-Vorkommen)
//
// Pace ist die ZIEL-Pace (aus expliziter Pace oder aus der Zone abgeleitet) —
// es sind geplante, noch nicht gelaufene Einheiten. In der Grafik gilt:
// längerer Balken = schnellere Pace.
// ============================================================

import type {
  TrainingPlanBlockSegment,
  TrainingPlanBlockSegmentKind,
} from "@/lib/db/schema";
import type { PaceZones } from "@/lib/endurance/plan";
import { paceRangeForZone } from "@/lib/endurance/plan-format";

export type Split = {
  index: number;
  paceSec: number;
  kind: TrainingPlanBlockSegmentKind;
  // Distanz des Splits in Metern (explizit oder aus Dauer/Pace abgeleitet).
  // Steuert die DICKE des Balkens (3 km → 3× so dick wie 1 km).
  meters: number;
  // schnellster Split (kürzeste Pace) — wird in der Grafik hervorgehoben.
  isFastest: boolean;
};

export type SplitsResult = {
  // "km"    = reiner Dauerlauf (alle Balken sind Kilometer)
  // "laps"  = reine Intervalle (alle Balken sind Runden/Segmente)
  // "mixed" = Kombination: durchgehende Blöcke km-weise, Strides/Intervalle
  //           als Runden (z.B. Recovery-Lauf + Strides am Ende)
  mode: "km" | "laps" | "mixed";
  splits: Split[];
};

export type SplitsBlock = {
  repetitions: number;
  segmentsJson: TrainingPlanBlockSegment[];
};

// Mittlere Ziel-Pace eines Segments (Sekunden/km): explizite Pace bevorzugt,
// sonst Mittelwert der aus der Zone abgeleiteten Range.
function segmentPaceSec(
  seg: TrainingPlanBlockSegment,
  zones: PaceZones | null,
): number | null {
  if (seg.paceMinSec != null && seg.paceMaxSec != null) {
    return (seg.paceMinSec + seg.paceMaxSec) / 2;
  }
  const r = paceRangeForZone(seg, zones);
  return r ? (r.minSec + r.maxSec) / 2 : null;
}

// Distanz eines Segments in Metern: explizite Distanz, sonst aus Dauer × Pace.
function segmentMeters(seg: TrainingPlanBlockSegment, paceSec: number): number {
  if (seg.distanceMeters != null) return seg.distanceMeters;
  if (seg.durationSec != null && paceSec > 0) {
    return (seg.durationSec / paceSec) * 1000;
  }
  return 0;
}

type Run = { kind: TrainingPlanBlockSegmentKind; paceSec: number; meters: number };

// Blocks → flache Liste von "Runs" (jedes Segment-Vorkommen, reps expandiert).
function expandRuns(blocks: SplitsBlock[], zones: PaceZones | null): Run[] {
  const runs: Run[] = [];
  for (const b of blocks) {
    const reps = Math.max(1, b.repetitions);
    for (let r = 0; r < reps; r++) {
      for (const seg of b.segmentsJson ?? []) {
        const paceSec = segmentPaceSec(seg, zones);
        if (paceSec == null || paceSec <= 0) continue;
        runs.push({ kind: seg.kind, paceSec, meters: segmentMeters(seg, paceSec) });
      }
    }
  }
  return runs;
}

// Run, der eine bestimmte kumulierte Distanz abdeckt.
function runAtDistance(runs: Run[], distance: number): Run | null {
  let acc = 0;
  for (const run of runs) {
    acc += run.meters;
    if (distance <= acc) return run;
  }
  return runs[runs.length - 1] ?? null;
}

function withFastest(
  mode: "km" | "laps" | "mixed",
  splits: Omit<Split, "isFastest">[],
): SplitsResult {
  if (splits.length === 0) return { mode, splits: [] };
  const min = Math.min(...splits.map((s) => s.paceSec));
  return {
    mode,
    splits: splits.map((s) => ({ ...s, isFastest: Math.round(s.paceSec) <= Math.round(min) })),
  };
}

// Gesamt-Dauer + -Distanz einer Session. Fehlt einem Segment ein Maß, wird es
// über die (Zonen-)Pace abgeleitet — so ist eine dauer-basierte Intervall-
// Session trotzdem in km darstellbar und umgekehrt. reps werden multipliziert.
export function sessionTotals(
  blocks: SplitsBlock[],
  zones: PaceZones | null,
): { durationSec: number; distanceMeters: number } {
  let durationSec = 0;
  let distanceMeters = 0;
  for (const b of blocks) {
    const reps = Math.max(1, b.repetitions);
    let bd = 0;
    let bdist = 0;
    for (const seg of b.segmentsJson ?? []) {
      const pace = segmentPaceSec(seg, zones);
      const meters =
        seg.distanceMeters ??
        (seg.durationSec != null && pace ? (seg.durationSec / pace) * 1000 : 0);
      const dur =
        seg.durationSec ??
        (seg.distanceMeters != null && pace ? (seg.distanceMeters / 1000) * pace : 0);
      bd += dur;
      bdist += meters;
    }
    durationSec += bd * reps;
    distanceMeters += bdist * reps;
  }
  return { durationSec: Math.round(durationSec), distanceMeters: Math.round(distanceMeters) };
}

// Mindest-Distanz, ab der ein durchgehender (reps=1) Block km-weise abgetastet
// wird. Kürzere reps=1-Blöcke (z.B. einzelne kurze Strides) bleiben ein Balken.
const KM_SPLIT_MIN_METERS = 1500;

// Tastet einen einzelnen zusammenhängenden Block km-weise ab.
function kmSplitsForBlock(
  blockRuns: Run[],
  startIndex: number,
): Omit<Split, "isFastest">[] {
  const total = blockRuns.reduce((s, r) => s + r.meters, 0);
  const kmCount = Math.max(1, Math.round(total / 1000));
  const out: Omit<Split, "isFastest">[] = [];
  for (let i = 0; i < kmCount; i++) {
    const mid = Math.min((i + 0.5) * 1000, total);
    const run = runAtDistance(blockRuns, mid);
    out.push({
      index: startIndex + i,
      paceSec: run?.paceSec ?? blockRuns[0]?.paceSec ?? 0,
      kind: run?.kind ?? "work",
      meters: 1000, // km-Modus → einheitliche Dicke pro Balken
    });
  }
  return out;
}

export function buildSplits(
  blocks: SplitsBlock[],
  zones: PaceZones | null,
): SplitsResult {
  // PRO BLOCK entscheiden, statt die ganze Session über einen Kamm zu scheren:
  //  - durchgehender Block (reps=1, ≥1,5 km) → km-weise Balken
  //  - Intervall-/Strides-Block (reps>1) oder kurzer reps=1-Block → pro
  //    Segment-Vorkommen ein Balken (Runde)
  // So wird "Recovery-Dauerlauf + Strides" korrekt kombiniert dargestellt.
  const splits: Omit<Split, "isFastest">[] = [];
  let idx = 0;
  let anyKm = false;
  let anyLap = false;

  for (const b of blocks) {
    const reps = Math.max(1, b.repetitions);
    const blockRuns = expandRuns(
      [{ repetitions: reps, segmentsJson: b.segmentsJson }],
      zones,
    );
    if (blockRuns.length === 0) continue;

    const blockMeters = blockRuns.reduce((s, r) => s + r.meters, 0);
    if (reps === 1 && blockMeters >= KM_SPLIT_MIN_METERS) {
      const kmSplits = kmSplitsForBlock(blockRuns, idx + 1);
      splits.push(...kmSplits);
      idx += kmSplits.length;
      anyKm = true;
    } else {
      // Strides/Intervalle bzw. kurzer Block → jedes Segment-Vorkommen als Balken.
      for (const r of blockRuns) {
        splits.push({
          index: ++idx,
          paceSec: r.paceSec,
          kind: r.kind,
          meters: r.meters,
        });
      }
      anyLap = true;
    }
  }

  if (splits.length === 0) {
    const isInterval = blocks.some((b) => b.repetitions > 1);
    return { mode: isInterval ? "laps" : "km", splits: [] };
  }
  const mode = anyKm && anyLap ? "mixed" : anyKm ? "km" : "laps";
  return withFastest(mode, splits);
}
