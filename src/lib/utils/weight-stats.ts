import type { WeightEntry } from "@/lib/db/schema";

export type WindowAvg = {
  avg: number | null;
  // Anzahl Messungen im Fenster — auch wenn null returns, gibt Auskunft über Datenlage.
  count: number;
};

export type WeightStats = {
  current: number | null;
  currentDate: string | null;
  // Wöchentlicher Schnitt: letzte 7 Tage (relativ zum aktuellsten Eintrag).
  weekAvg: WindowAvg;
  // Schnitt der 7 Tage davor (Tag -14 bis Tag -7).
  prevWeekAvg: WindowAvg;
  // Schnitt der letzten 28 Tage als mittelfristige Baseline.
  fourWeekAvg: WindowAvg;
  min: number | null;
  max: number | null;
  avg: number | null;
  count: number;
};

// Erwartet Einträge in chronologischer Reihenfolge (asc).
export function computeWeightStats(entries: WeightEntry[]): WeightStats {
  if (entries.length === 0) {
    return {
      current: null,
      currentDate: null,
      weekAvg: { avg: null, count: 0 },
      prevWeekAvg: { avg: null, count: 0 },
      fourWeekAvg: { avg: null, count: 0 },
      min: null,
      max: null,
      avg: null,
      count: 0,
    };
  }

  const latest = entries[entries.length - 1];
  const weights = entries.map((e) => e.weightKg);
  const latestDate = latest.date;

  return {
    current: latest.weightKg,
    currentDate: latestDate,
    weekAvg: windowAverage(entries, latestDate, 0, 6),
    prevWeekAvg: windowAverage(entries, latestDate, 7, 13),
    fourWeekAvg: windowAverage(entries, latestDate, 0, 27),
    min: Math.min(...weights),
    max: Math.max(...weights),
    avg: weights.reduce((sum, w) => sum + w, 0) / weights.length,
    count: entries.length,
  };
}

// Mittelt Einträge, deren Datum im Fenster [anchor - endOffset, anchor - startOffset] liegt.
// Offsets in Tagen, inklusive. startOffset = 0 bedeutet "ab heute rückwärts".
function windowAverage(
  entries: WeightEntry[],
  anchorIso: string,
  startOffset: number,
  endOffset: number,
): WindowAvg {
  const anchor = new Date(`${anchorIso}T00:00:00`);
  const winEnd = new Date(anchor);
  winEnd.setDate(winEnd.getDate() - startOffset);
  const winStart = new Date(anchor);
  winStart.setDate(winStart.getDate() - endOffset);

  let sum = 0;
  let count = 0;
  for (const e of entries) {
    const d = new Date(`${e.date}T00:00:00`);
    if (d >= winStart && d <= winEnd) {
      sum += e.weightKg;
      count++;
    }
  }
  if (count === 0) return { avg: null, count: 0 };
  return { avg: sum / count, count };
}

export function formatAvg(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "–";
  return `${value.toFixed(1)} kg`;
}

// Differenz a − b. Null wenn ein Wert fehlt.
export function diff(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return a - b;
}

export function formatKg(value: number | null, fractionDigits = 1): string {
  if (value === null || Number.isNaN(value)) return "–";
  return `${value.toFixed(fractionDigits)} kg`;
}

export function formatTrend(value: number | null): {
  text: string;
  direction: "up" | "down" | "flat" | "none";
} {
  if (value === null) return { text: "–", direction: "none" };
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return { text: "±0.0 kg", direction: "flat" };
  const sign = rounded > 0 ? "+" : "";
  return {
    text: `${sign}${rounded.toFixed(1)} kg`,
    direction: rounded > 0 ? "up" : "down",
  };
}
