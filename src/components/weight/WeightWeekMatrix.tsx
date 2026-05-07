"use client";

import { EditableWeightCell } from "@/components/weight/EditableWeightCell";
import type { WeightEntry } from "@/lib/db/schema";
import { isoWeekMonday, isoWeeksInYear } from "@/lib/utils/iso-week";
import { cn } from "@/lib/utils";

type Props = {
  entries: WeightEntry[];
  year: number;
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

export function WeightWeekMatrix({ entries, year }: Props) {
  // Index alle Einträge des ISO-Jahres nach Woche und Wochentag.
  // Schlüssel: `${week}-${dayIdx}` mit dayIdx 0 (Mo) ... 6 (So).
  // Hinweis: Ein Datum wie 2024-12-30 kann ISO-mäßig zu KW 1 / 2025 gehören.
  const byKey = new Map<string, number>();
  for (const e of entries) {
    const d = new Date(e.date);
    const { year: isoY, week } = isoWeekOf(d);
    if (isoY !== year) continue;
    const dayIdx = (d.getDay() + 6) % 7;
    byKey.set(`${week}-${dayIdx}`, e.weightKg);
  }

  // Bis zur aktuellen ISO-Woche rendern, sonst leere zukünftige Wochen.
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
                if (v !== undefined) weights.push(v);
              }
              const avg =
                weights.length > 0
                  ? weights.reduce((a, b) => a + b, 0) / weights.length
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
                    return (
                      <Td key={dayIdx} className="p-0">
                        <div className="flex justify-end">
                          <EditableWeightCell
                            date={dateStr}
                            weightKg={value}
                            variant="cell"
                          />
                        </div>
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
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
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

