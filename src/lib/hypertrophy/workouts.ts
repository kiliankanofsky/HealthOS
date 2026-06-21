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

export type TemplateColorSet = {
  bg: string;
  ring: string;
  text: string;
  soft: string;
};

// Farb-Palette für Trainingseinheiten. Key = Farb-Name (in workout_templates.color
// gespeichert). Alle Klassen sind Literale, damit der Tailwind-v4-Scanner sie
// findet (keine dynamisch zusammengesetzten Klassennamen!).
export const TEMPLATE_PALETTE: Record<string, TemplateColorSet> = {
  indigo: { bg: "bg-indigo-500", ring: "ring-indigo-500/30", text: "text-indigo-700", soft: "bg-indigo-500/10" },
  emerald: { bg: "bg-emerald-500", ring: "ring-emerald-500/30", text: "text-emerald-700", soft: "bg-emerald-500/10" },
  orange: { bg: "bg-orange-500", ring: "ring-orange-500/30", text: "text-orange-700", soft: "bg-orange-500/10" },
  rose: { bg: "bg-rose-500", ring: "ring-rose-500/30", text: "text-rose-700", soft: "bg-rose-500/10" },
  violet: { bg: "bg-violet-500", ring: "ring-violet-500/30", text: "text-violet-700", soft: "bg-violet-500/10" },
  cyan: { bg: "bg-cyan-500", ring: "ring-cyan-500/30", text: "text-cyan-700", soft: "bg-cyan-500/10" },
  amber: { bg: "bg-amber-500", ring: "ring-amber-500/30", text: "text-amber-700", soft: "bg-amber-500/10" },
  teal: { bg: "bg-teal-500", ring: "ring-teal-500/30", text: "text-teal-700", soft: "bg-teal-500/10" },
  sky: { bg: "bg-sky-500", ring: "ring-sky-500/30", text: "text-sky-700", soft: "bg-sky-500/10" },
  fuchsia: { bg: "bg-fuchsia-500", ring: "ring-fuchsia-500/30", text: "text-fuchsia-700", soft: "bg-fuchsia-500/10" },
  lime: { bg: "bg-lime-500", ring: "ring-lime-500/30", text: "text-lime-700", soft: "bg-lime-500/10" },
  pink: { bg: "bg-pink-500", ring: "ring-pink-500/30", text: "text-pink-700", soft: "bg-pink-500/10" },
};

// Auswahl-Reihenfolge für neue Einheiten (Farb-Picker + Auto-Zuweisung).
export const PALETTE_KEYS = Object.keys(TEMPLATE_PALETTE);

const FALLBACK_COLOR: TemplateColorSet = {
  bg: "bg-slate-500",
  ring: "ring-slate-500/30",
  text: "text-slate-700",
  soft: "bg-slate-500/10",
};

export function paletteClasses(color: string | null | undefined): TemplateColorSet {
  return (color && TEMPLATE_PALETTE[color]) || FALLBACK_COLOR;
}

// Legacy: Farb-Tokens der 3 Original-Einheiten, falls color (Alt-Daten) null ist.
export const WORKOUT_COLORS: Record<WorkoutKind, TemplateColorSet> = {
  "upper-a": TEMPLATE_PALETTE.indigo,
  lower: TEMPLATE_PALETTE.emerald,
  "upper-b": TEMPLATE_PALETTE.orange,
};
const LEGACY_COLOR_KEY: Record<WorkoutKind, string> = {
  "upper-a": "indigo",
  lower: "emerald",
  "upper-b": "orange",
};

// Reihenfolge fürs Rendern (Legacy — die Rotation kommt jetzt aus
// workout_templates.sortOrder via getRotationTemplates).
export const WORKOUT_ORDER: WorkoutKind[] = ["upper-a", "lower", "upper-b"];

// Marker-Buchstabe aus dem Namen ableiten (erstes Alphanumerisches, groß).
function deriveLetter(name: string): string {
  const m = name.match(/[a-z0-9]/i);
  return (m?.[0] ?? "?").toUpperCase();
}

// Zentrale Quelle für die Visuals einer Trainingseinheit: liest zuerst die
// Row-Felder (color/letter), fällt für die 3 Originale auf die Legacy-Maps
// zurück und sonst auf Ableitung aus dem Namen. `kind` ist seit Migration 0018
// frei (string), daher hier nicht mehr getypt als WorkoutKind.
export function templateVisuals(t: {
  kind: string;
  name: string;
  color?: string | null;
  letter?: string | null;
}): { label: string; colors: TemplateColorSet; letter: string } {
  const legacyKey = LEGACY_COLOR_KEY[t.kind as WorkoutKind];
  const colors = paletteClasses(t.color ?? legacyKey);
  const letter = t.letter ?? deriveLetter(t.name);
  return { label: t.name, colors, letter };
}

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
