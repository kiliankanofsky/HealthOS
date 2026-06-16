// Visuelle Konstanten + Labels für die drei Workout-Typen.
// Quelle der Wahrheit für DB-Inhalte ist `workout_templates`,
// hier nur das, was rein UI-Sache ist.

import type { WorkoutKind } from "@/lib/db/schema";

export const WORKOUT_LABELS: Record<WorkoutKind, string> = {
  "upper-a": "Upper A",
  lower: "Lower",
  "upper-b": "Upper B",
};

// Kurzform für Marker: A / L / B.
export const WORKOUT_MARKER_LETTER: Record<WorkoutKind, string> = {
  "upper-a": "A",
  lower: "L",
  "upper-b": "B",
};

// Tailwind-Farb-Tokens. Pro Workout-Typ ein eigenes Hue,
// damit Markers im Kalender und Cards visuell konsistent sind.
export const WORKOUT_COLORS: Record<
  WorkoutKind,
  { bg: string; ring: string; text: string; soft: string }
> = {
  "upper-a": {
    bg: "bg-indigo-500",
    ring: "ring-indigo-500/30",
    text: "text-indigo-700",
    soft: "bg-indigo-500/10",
  },
  lower: {
    bg: "bg-emerald-500",
    ring: "ring-emerald-500/30",
    text: "text-emerald-700",
    soft: "bg-emerald-500/10",
  },
  "upper-b": {
    bg: "bg-orange-500",
    ring: "ring-orange-500/30",
    text: "text-orange-700",
    soft: "bg-orange-500/10",
  },
};

// Reihenfolge fürs Rendern.
export const WORKOUT_ORDER: WorkoutKind[] = ["upper-a", "lower", "upper-b"];

// Tausch-Übungen haben keinen DB-Slug (nur einen freien Namen). Für die
// URL der Tracker-Seite (/hypertrophy/alt/<slug>) leiten wir den Slug aus dem
// Namen ab. Reverse-Lookup auf der Seite vergleicht die slugifizierten Namen —
// Kollisionen sind bei einem Single-User unkritisch (erster Treffer gewinnt).
export function swapNameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // diakritische Zeichen entfernen
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
