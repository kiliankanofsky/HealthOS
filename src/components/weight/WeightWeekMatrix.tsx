"use client";

import { Cookie, Wine } from "lucide-react";

import type {
  DailyTag,
  NutritionEntry,
  NutritionExclusion,
  WeightEntry,
} from "@/lib/db/schema";
import { isoWeekMonday, isoWeeksInYear } from "@/lib/utils/iso-week";
import { buildExclusionLookup } from "@/lib/utils/nutrition-exclusions";
import { effectiveCaloriesForDay } from "@/lib/utils/nutrition-recommendation";
import { cn } from "@/lib/utils";

type Props = {
  entries: WeightEntry[];
  tags: DailyTag[];
  nutrition: NutritionEntry[];
  /** Ausgeschlossene Zeiträume — deren Tage zählen nicht in den Wochen-Ø. */
  exclusions: NutritionExclusion[];
  year: number;
  onOpenDay: (date: string) => void;
};

const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// Berechnet ISO-Kalenderwoche und Jahr eines Datums.
function isoWeekOf(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Donnerstag der gleichen Woche bestimmt das ISO-Wochen-Jahr.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week =
    Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function formatLocalISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type CellValue = {
  weight: number;
  cheatDay: boolean;
  alcohol: boolean;
};

export function WeightWeekMatrix({
  entries,
  tags,
  nutrition,
  exclusions,
  year,
  onOpenDay,
}: Props) {
  const tagByDate = new Map<string, DailyTag>();
  for (const t of tags) tagByDate.set(t.date, t);

  const nutritionByDate = new Map<string, NutritionEntry>();
  for (const n of nutrition) nutritionByDate.set(n.date, n);

  const isExcluded = buildExclusionLookup(exclusions);

  // Index alle Einträge nach Woche und Wochentag.
  const byKey = new Map<string, CellValue>();
  for (const e of entries) {
    const d = new Date(e.date);
    const { year: isoY, week } = isoWeekOf(d);
    if (isoY !== year) continue;
    const dayIdx = (d.getDay() + 6) % 7;
    const tag = tagByDate.get(e.date);
    byKey.set(`${week}-${dayIdx}`, {
      weight: e.weightKg,
      cheatDay: tag?.cheatDay ?? false,
      alcohol: tag?.alcohol ?? false,
    });
  }

  const today = new Date();
  const todayIsoYear = isoWeekOf(today).year;
  const todayIsoWeek = isoWeekOf(today).week;
  const maxWeek =
    year < todayIsoYear ? isoWeeksInYear(year) : year === todayIsoYear ? todayIsoWeek : 1;

  const rows: number[] = [];
  for (let w = 1; w <= maxWeek; w++) rows.push(w);

  return (
    <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <tr>
            <Th className="text-left">KW</Th>
            <Th className="text-left">Zeitraum</Th>
            {DAY_LABELS.map((label) => (
              <Th key={label} className="text-right">
                {label}
              </Th>
            ))}
            <Th className="text-right">⌀ Woche</Th>
            <Th className="text-right">⌀ kcal/Tag</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {rows
            .slice()
            .reverse()
            .map((w) => {
              const monday = isoWeekMonday(year, w);
              const sunday = new Date(monday);
              sunday.setUTCDate(monday.getUTCDate() + 6);

              const weights: number[] = [];
              for (let d = 0; d < 7; d++) {
                const v = byKey.get(`${w}-${d}`);
                if (v !== undefined) weights.push(v.weight);
              }
              const avg =
                weights.length > 0
                  ? weights.reduce((a, b) => a + b, 0) / weights.length
                  : null;

              // Effektive (Cheat-bereinigte) Kalorien je Tag → Wochenschnitt.
              // Cheat-Day/Cheat-Meal überschreiben den fddb-Wert, ausgeschlossene
              // Zeiträume liefern gar keinen (gleiche Engine wie /weight & der
              // KI-Kontext). Tage ohne Wert zählen nicht mit.
              const kcalValues: number[] = [];
              let weekHasCheat = false;
              for (let d = 0; d < 7; d++) {
                const cellDate = new Date(monday);
                cellDate.setUTCDate(monday.getUTCDate() + d);
                const dateStr = formatLocalISO(cellDate);
                const eff = effectiveCaloriesForDay(
                  nutritionByDate.get(dateStr) ?? null,
                  tagByDate.get(dateStr) ?? null,
                  dateStr,
                  isExcluded(dateStr),
                );
                if (eff.caloriesKcal != null) kcalValues.push(eff.caloriesKcal);
                if (eff.cheatDay || eff.cheatMeal) weekHasCheat = true;
              }
              const avgKcal =
                kcalValues.length > 0
                  ? Math.round(
                      kcalValues.reduce((a, b) => a + b, 0) / kcalValues.length,
                    )
                  : null;

              return (
                <tr key={w} className="hover:bg-muted/30">
                  <Td className="font-medium tabular-nums">{w}</Td>
                  <Td className="text-xs text-muted-foreground tabular-nums">
                    {formatRange(monday, sunday)}
                  </Td>
                  {DAY_LABELS.map((_, dayIdx) => {
                    const cellDate = new Date(monday);
                    cellDate.setUTCDate(monday.getUTCDate() + dayIdx);
                    const dateStr = formatLocalISO(cellDate);
                    const value = byKey.get(`${w}-${dayIdx}`) ?? null;
                    const future =
                      cellDate.getTime() >
                      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
                    return (
                      <Td key={dayIdx} className="p-0">
                        <button
                          type="button"
                          onClick={() => onOpenDay(dateStr)}
                          disabled={future}
                          aria-label={`Tag ${dateStr} öffnen`}
                          className={cn(
                            "relative flex h-10 w-full items-center justify-end rounded-md px-3 text-right tabular-nums",
                            "transition-colors",
                            value
                              ? "text-foreground hover:bg-muted/60"
                              : "text-muted-foreground/40 hover:bg-muted/40",
                            future && "cursor-not-allowed hover:bg-transparent",
                          )}
                        >
                          {value ? value.weight.toFixed(1) : "–"}
                          {value && renderTagIcons(value)}
                        </button>
                      </Td>
                    );
                  })}
                  <Td
                    className={cn(
                      "text-right tabular-nums",
                      avg === null && "text-muted-foreground/40",
                    )}
                  >
                    {avg === null ? "–" : avg.toFixed(1)}
                  </Td>
                  <Td
                    className={cn(
                      "text-right tabular-nums",
                      avgKcal === null && "text-muted-foreground/40",
                    )}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      {weekHasCheat && (
                        <Cookie
                          aria-label="Cheat-Day in dieser Woche"
                          className="size-3 text-rose-600"
                        />
                      )}
                      {avgKcal === null ? "–" : avgKcal.toLocaleString("de-DE")}
                    </span>
                  </Td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

// Tag-Icons (Cheat/Alkohol) am rechten Rand der Zelle. Bei einem einzelnen
// Marker oben rechts; bei zweien stapeln wir oben rechts + Mitte rechts.
function renderTagIcons(value: CellValue) {
  type TagIcon = { key: "cheat" | "alcohol"; label: string; Icon: typeof Cookie };
  const icons: TagIcon[] = [];
  if (value.cheatDay) icons.push({ key: "cheat", label: "Cheat Day", Icon: Cookie });
  if (value.alcohol) icons.push({ key: "alcohol", label: "Alkohol", Icon: Wine });

  return icons.map((it, idx) => {
    const position =
      idx === 0
        ? "top-0.5 right-0.5"
        : "top-1/2 right-0.5 -translate-y-1/2";
    return (
      <it.Icon
        key={it.key}
        aria-label={it.label}
        className={cn("absolute size-2.5 text-rose-600", position)}
      />
    );
  });
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-3 py-3 font-medium", className)}>{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2 align-middle", className)}>{children}</td>;
}

function formatRange(monday: Date, sunday: Date): string {
  const m = `${String(monday.getUTCDate()).padStart(2, "0")}.${String(
    monday.getUTCMonth() + 1,
  ).padStart(2, "0")}.`;
  const s = `${String(sunday.getUTCDate()).padStart(2, "0")}.${String(
    sunday.getUTCMonth() + 1,
  ).padStart(2, "0")}.`;
  return `${m} – ${s}`;
}
