// ============================================================
// Phase 4 Sprint 4 — Anzeige-Helfer für Trainingsplan-Sessions/Blocks.
//
// Reine Formatier-Logik (keine DB, kein React) — von Kalender, Nächste-
// Session-Card, Übersicht und Edit-Dialog gemeinsam genutzt, damit
// Labels/Farben/Pace-Texte überall identisch aussehen.
// ============================================================

import type {
  TrainingPlanBlock,
  TrainingPlanBlockSegment,
  TrainingPlanBlockSegmentKind,
  TrainingPlanPhase,
  TrainingPlanSessionStatus,
  TrainingPlanSessionType,
} from "@/lib/db/schema";
import { formatPace, type PaceZones } from "@/lib/endurance/plan";

// ---- Labels (Deutsch) ----

export const SESSION_TYPE_LABELS: Record<TrainingPlanSessionType, string> = {
  recovery: "Recovery",
  easy: "Easy",
  tempo: "Tempo",
  threshold: "Threshold",
  vo2max: "VO2max",
  long: "Long Run",
};

export const SESSION_STATUS_LABELS: Record<TrainingPlanSessionStatus, string> = {
  planned: "Geplant",
  completed: "Erledigt",
  skipped: "Ausgelassen",
  modified: "Angepasst",
};

export const PHASE_LABELS: Record<TrainingPlanPhase, string> = {
  base: "Grundlage",
  build: "Aufbau",
  peak: "Spitze",
  taper: "Tapering",
  race: "Wettkampf",
};

// Phasen-Farben für die Timeline (Race-Plan-Card) und die Übersicht.
// Aufsteigende Intensität: hell → kräftig.
export const PHASE_TONE: Record<TrainingPlanPhase, string> = {
  base: "bg-sky-400",
  build: "bg-indigo-400",
  peak: "bg-amber-400",
  taper: "bg-emerald-400",
  race: "bg-rose-500",
};

export const SEGMENT_KIND_LABELS: Record<TrainingPlanBlockSegmentKind, string> = {
  warmup: "Einlaufen",
  work: "Belastung",
  recovery: "Trabpause",
  cooldown: "Auslaufen",
};

// ---- Farben pro Session-Typ ----
// `chip` = kräftige Füllung für die Kalender-Pille, `soft` = helle Variante
// für Badges in den Cards. Gruppiert nach Intensität, damit der Kalender auf
// einen Blick lesbar ist (blau = locker … rot = hart).

export type SessionTone = { chip: string; soft: string };

const TONE: Record<string, SessionTone> = {
  slate: { chip: "bg-slate-400 text-white", soft: "bg-slate-100 text-slate-700" },
  sky: { chip: "bg-sky-500 text-white", soft: "bg-sky-100 text-sky-900" },
  indigo: { chip: "bg-indigo-500 text-white", soft: "bg-indigo-100 text-indigo-900" },
  amber: { chip: "bg-amber-500 text-white", soft: "bg-amber-100 text-amber-900" },
  orange: { chip: "bg-orange-500 text-white", soft: "bg-orange-100 text-orange-900" },
  rose: { chip: "bg-rose-500 text-white", soft: "bg-rose-100 text-rose-900" },
  emerald: { chip: "bg-emerald-500 text-white", soft: "bg-emerald-100 text-emerald-900" },
};

const TYPE_TONE: Record<TrainingPlanSessionType, keyof typeof TONE> = {
  recovery: "slate",
  easy: "sky",
  long: "indigo",
  tempo: "amber",
  threshold: "orange",
  vo2max: "rose",
};

// Defensiv: bei unerwarteten/Legacy-Typen (z.B. alte Pläne mit "intervals",
// "rest" …, die es vor Sprint 4.1 gab) NICHT crashen, sondern auf slate
// zurückfallen. Wichtig, weil bestehende DB-Pläne noch alte Typen enthalten.
export function sessionTone(type: TrainingPlanSessionType): SessionTone {
  return TONE[TYPE_TONE[type]] ?? TONE.slate;
}

// Label mit Fallback auf den rohen Typ-String (statt leer), falls der Typ
// nicht (mehr) in der 6er-Liste ist.
export function sessionTypeLabel(type: TrainingPlanSessionType): string {
  return SESSION_TYPE_LABELS[type] ?? String(type);
}

// ---- Distanz / Dauer ----

// Meter → "10,0 km" (≥1 km) oder "800 m". Deutsches Dezimalkomma.
export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return "—";
  if (meters >= 1000) {
    const km = meters / 1000;
    // Ganze km ohne Nachkommastelle, sonst eine.
    const str = Number.isInteger(km) ? String(km) : km.toFixed(1).replace(".", ",");
    return `${str} km`;
  }
  return `${Math.round(meters)} m`;
}

// Sekunden → kompakte Dauer für Chips: "60 min", "90 s", "1:30 h".
export function formatDurationShort(sec: number | null | undefined): string {
  if (sec == null) return "—";
  if (sec < 120) return `${Math.round(sec)} s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return m === 0 ? `${h} h` : `${h}:${String(m).padStart(2, "0")} h`;
}

// ---- Zone → Pace ----

// Eine Zone (1..5) oder eine Range (zoneMin..zoneMax) → Pace-Fenster in s/km.
// Höhere Zone = schnellere Pace = kleinere Sekundenzahl. Eine Range "Z1–Z2"
// spannt von der schnellsten Grenze (höhere Zone, minSec) bis zur langsamsten
// (niedrigere Zone, maxSec).
export function paceRangeForZone(
  seg: Pick<TrainingPlanBlockSegment, "zone" | "zoneMin" | "zoneMax">,
  zones: PaceZones | null | undefined,
): { minSec: number; maxSec: number } | null {
  if (!zones) return null;
  const lo = seg.zoneMin ?? seg.zone;
  const hi = seg.zoneMax ?? seg.zone;
  if (lo == null || hi == null) return null;
  const fast = Math.max(lo, hi); // höhere Zone = schneller
  const slow = Math.min(lo, hi);
  const fastZone = zones[`z${fast}` as keyof PaceZones];
  const slowZone = zones[`z${slow}` as keyof PaceZones];
  if (!fastZone || !slowZone) return null;
  return { minSec: fastZone.minSec, maxSec: slowZone.maxSec };
}

// "Z3" oder "Z1–Z2".
export function formatZoneLabel(
  seg: Pick<TrainingPlanBlockSegment, "zone" | "zoneMin" | "zoneMax">,
): string {
  const lo = seg.zoneMin ?? seg.zone;
  const hi = seg.zoneMax ?? seg.zone;
  if (lo == null || hi == null) return "—";
  return lo === hi ? `Z${lo}` : `Z${Math.min(lo, hi)}–Z${Math.max(lo, hi)}`;
}

// "4:15/km" oder "4:01–4:11/km". Bevorzugt explizite Pace-Werte, fällt sonst
// auf die aus der Zone abgeleiteten zurück.
export function formatSegmentPace(
  seg: TrainingPlanBlockSegment,
  zones: PaceZones | null | undefined,
): string | null {
  let min = seg.paceMinSec;
  let max = seg.paceMaxSec;
  if (min == null || max == null) {
    const derived = paceRangeForZone(seg, zones);
    if (!derived) return null;
    min = derived.minSec;
    max = derived.maxSec;
  }
  if (Math.round(min) === Math.round(max)) return formatPace(min, { withUnit: true });
  return `${formatPace(min)}–${formatPace(max, { withUnit: true })}`;
}

// ---- Segment / Block → lesbarer Text ----

// Maßangabe eines Segments: "1000 m" oder "15 min".
export function formatSegmentMeasure(seg: TrainingPlanBlockSegment): string {
  if (seg.distanceMeters != null) return formatDistance(seg.distanceMeters);
  if (seg.durationSec != null) return formatDurationShort(seg.durationSec);
  return "—";
}

// Ein Segment als Kurztext: "1000 m Z4" / "15 min Z1".
export function describeSegment(seg: TrainingPlanBlockSegment): string {
  return `${formatSegmentMeasure(seg)} ${formatZoneLabel(seg)}`.trim();
}

// Ein Block als Kurztext, inkl. Wiederholungen:
//   reps=1, 1 Segment   → "15 min Z1"
//   reps=6, 2 Segmente  → "6× (1000 m Z4 · 90 s Z1)"
export function describeBlock(block: Pick<TrainingPlanBlock, "repetitions" | "segmentsJson">): string {
  const segs = block.segmentsJson ?? [];
  const inner = segs.map(describeSegment).join(" · ");
  if (block.repetitions > 1) return `${block.repetitions}× (${inner})`;
  return inner;
}

// Die ganze Session als ein- bis dreizeilige Block-Liste (für Cards).
export function describeBlocks(
  blocks: Pick<TrainingPlanBlock, "repetitions" | "segmentsJson">[],
): string[] {
  return blocks.map(describeBlock);
}
