"use client";

import { Cookie, Wine } from "lucide-react";
import type { WeightEntry } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type Props = {
  // Erwartet chronologisch aufsteigende Sortierung; wir rendern absteigend.
  entries: WeightEntry[];
  onOpenDay: (date: string) => void;
};

const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function WeightDayList({ entries, onOpenDay }: Props) {
  if (entries.length === 0) {
    return (
      <p className="rounded-2xl bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
        Noch keine Einträge vorhanden.
      </p>
    );
  }

  // Vom neuesten zum ältesten anzeigen.
  const reversed = [...entries].reverse();

  // δ zum Vortag.
  const byDate = new Map<string, number>();
  for (const e of entries) byDate.set(e.date, e.weightKg);

  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-black/5">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <tr>
            <Th className="text-left">Datum</Th>
            <Th className="text-left">Wochentag</Th>
            <Th className="text-right">Gewicht</Th>
            <Th className="text-right">Δ Vortag</Th>
            <Th className="text-center">Tags</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {reversed.map((entry) => {
            const prev = previousDateWeight(byDate, entry.date);
            const delta = prev === null ? null : entry.weightKg - prev;
            return <Row key={entry.id} entry={entry} delta={delta} onOpen={onOpenDay} />;
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  entry,
  delta,
  onOpen,
}: {
  entry: WeightEntry;
  delta: number | null;
  onOpen: (date: string) => void;
}) {
  const weekday = WEEKDAY_LABELS[new Date(entry.date).getDay()];

  return (
    <tr
      onClick={() => onOpen(entry.date)}
      className="cursor-pointer transition-colors hover:bg-muted/30"
    >
      <Td className="font-medium">{formatDate(entry.date)}</Td>
      <Td className="text-muted-foreground">{weekday}</Td>
      <Td className="text-right tabular-nums">{entry.weightKg.toFixed(1)}</Td>
      <Td className="text-right tabular-nums">
        {delta === null ? (
          <span className="text-muted-foreground/40">–</span>
        ) : (
          <span
            className={cn(
              "tabular-nums",
              delta > 0
                ? "text-orange-600"
                : delta < 0
                  ? "text-emerald-600"
                  : "text-muted-foreground",
            )}
          >
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)}
          </span>
        )}
      </Td>
      <Td className="text-center">
        <div className="inline-flex items-center justify-center gap-1">
          {entry.cheatDay && (
            <span
              aria-label="Cheat Day"
              className="inline-flex size-5 items-center justify-center rounded-full bg-muted text-rose-600"
            >
              <Cookie className="size-3" />
            </span>
          )}
          {entry.alcohol && (
            <span
              aria-label="Alkohol"
              className="inline-flex size-5 items-center justify-center rounded-full bg-muted text-rose-600"
            >
              <Wine className="size-3" />
            </span>
          )}
          {entry.notes && (
            <span
              aria-label="Notiz"
              className="ml-0.5 size-1.5 rounded-full bg-muted-foreground/50"
            />
          )}
        </div>
      </Td>
    </tr>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-4 py-3 font-medium", className)}>{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function previousDateWeight(
  byDate: Map<string, number>,
  date: string,
): number | null {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  const prev = d.toISOString().slice(0, 10);
  return byDate.get(prev) ?? null;
}
