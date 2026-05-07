import type { WeightEntry } from "@/lib/db/schema";

export type WeightStats = {
  current: number | null;
  currentDate: string | null;
  trend7d: number | null;
  trend30d: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  count: number;
};

// Erwartet Einträge in chronologischer Reihenfolge (asc).
// Berechnet Trend als Differenz zum nächstgelegenen Eintrag, der mind. n Tage zurückliegt.
export function computeWeightStats(entries: WeightEntry[]): WeightStats {
  if (entries.length === 0) {
    return {
      current: null,
      currentDate: null,
      trend7d: null,
      trend30d: null,
      min: null,
      max: null,
      avg: null,
      count: 0,
    };
  }

  const latest = entries[entries.length - 1];
  const weights = entries.map((e) => e.weightKg);

  return {
    current: latest.weightKg,
    currentDate: latest.date,
    trend7d: computeTrend(entries, 7),
    trend30d: computeTrend(entries, 30),
    min: Math.min(...weights),
    max: Math.max(...weights),
    avg: weights.reduce((sum, w) => sum + w, 0) / weights.length,
    count: entries.length,
  };
}

// Differenz zwischen aktuellstem Eintrag und dem nächstgelegenen Eintrag,
// der mindestens `days` Tage zurückliegt. Negative Werte = Gewichtsabnahme.
function computeTrend(entries: WeightEntry[], days: number): number | null {
  if (entries.length < 2) return null;

  const latest = entries[entries.length - 1];
  const latestDate = new Date(latest.date);
  const cutoff = new Date(latestDate);
  cutoff.setDate(cutoff.getDate() - days);

  // Suche rückwärts den ersten Eintrag, der am oder vor cutoff liegt.
  for (let i = entries.length - 2; i >= 0; i--) {
    if (new Date(entries[i].date) <= cutoff) {
      return latest.weightKg - entries[i].weightKg;
    }
  }
  // Kein Eintrag im gewünschten Zeitfenster.
  return null;
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
