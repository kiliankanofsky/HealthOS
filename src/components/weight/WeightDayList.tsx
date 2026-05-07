"use client";

import { useTransition } from "react";
import { removeWeightEntry } from "@/app/weight/actions";
import { EditableWeightCell } from "@/components/weight/EditableWeightCell";
import type { WeightEntry } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type Props = {
  // Erwartet chronologisch aufsteigende Sortierung; wir rendern absteigend.
  entries: WeightEntry[];
};

const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function WeightDayList({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <p className="rounded-2xl bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
        Noch keine Einträge vorhanden.
      </p>
    );
  }

  // Vom neuesten zum ältesten anzeigen.
  const reversed = [...entries].reverse();

  // δ zum Vortag: wir mappen Datum → Gewicht aus der ursprünglich aufsteigenden Liste.
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
            <Th className="text-left">Quelle</Th>
            <Th className="text-right">Aktion</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {reversed.map((entry) => {
            const prev = previousDateWeight(byDate, entry.date);
            const delta = prev === null ? null : entry.weightKg - prev;
            return (
              <Row key={entry.id} entry={entry} delta={delta} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({ entry, delta }: { entry: WeightEntry; delta: number | null }) {
  const [pending, startTransition] = useTransition();
  const weekday = WEEKDAY_LABELS[new Date(entry.date).getDay()];

  return (
    <tr className={cn("transition-colors hover:bg-muted/30", pending && "opacity-50")}>
      <Td className="font-medium">{formatDate(entry.date)}</Td>
      <Td className="text-muted-foreground">{weekday}</Td>
      <Td className="p-0 pr-2">
        <div className="flex justify-end">
          <EditableWeightCell
            date={entry.date}
            weightKg={entry.weightKg}
            variant="row"
            className="max-w-24"
          />
        </div>
      </Td>
      <Td className="text-right tabular-nums">
        {delta === null ? (
          <span className="text-muted-foreground/40">–</span>
        ) : (
          <span
            className={cn(
              "tabular-nums",
              delta > 0 ? "text-orange-600" : delta < 0 ? "text-emerald-600" : "text-muted-foreground",
            )}
          >
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)}
          </span>
        )}
      </Td>
      <Td className="text-xs uppercase tracking-wide text-muted-foreground">
        {entry.source}
      </Td>
      <Td className="text-right">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Eintrag vom ${formatDate(entry.date)} löschen?`)) return;
            const fd = new FormData();
            fd.set("id", String(entry.id));
            startTransition(async () => {
              await removeWeightEntry(fd);
            });
          }}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          Löschen
        </button>
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
