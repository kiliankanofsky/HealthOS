import Link from "next/link";

import type { PhaseKind } from "@/lib/db/schema";
import type { WeightStats } from "@/lib/utils/weight-stats";
import { diff } from "@/lib/utils/weight-stats";
import { cn } from "@/lib/utils";

// Weight-Sektion der Startseite: drei Stat-Cards (aktuell / Woche vs.
// Vorwoche / Woche vs. 4-Wochen-Schnitt). Delta-Färbung ist phasengerecht:
// im Cut ist Abnahme grün, im Bulk Zunahme, in Maintenance Stabilität.

type Props = {
  stats: WeightStats;
  phaseKind: PhaseKind | null;
};

export function WeightCards({ stats, phaseKind }: Props) {
  const weekDelta = diff(stats.weekAvg.avg, stats.prevWeekAvg.avg);
  const fourWeekDelta = diff(stats.weekAvg.avg, stats.fourWeekAvg.avg);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        kicker="Aktuell"
        value={formatKg(stats.current)}
        sub={stats.currentDate ?? "—"}
      />
      <StatCard
        kicker="Diese Woche"
        value={formatKg(stats.weekAvg.avg)}
        delta={weekDelta}
        phaseKind={phaseKind}
        sub={`vs. Vorwoche ${formatKg(stats.prevWeekAvg.avg)}`}
      />
      <StatCard
        kicker="4-Wochen-Trend"
        value={formatKg(stats.weekAvg.avg)}
        delta={fourWeekDelta}
        phaseKind={phaseKind}
        sub={`vs. 4-Wochen-Schnitt ${formatKg(stats.fourWeekAvg.avg)}`}
      />
    </div>
  );
}

function StatCard({
  kicker,
  value,
  sub,
  delta,
  phaseKind,
}: {
  kicker: string;
  value: string;
  sub: string;
  delta?: number | null;
  phaseKind?: PhaseKind | null;
}) {
  return (
    <Link
      href="/weight"
      className="group rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <p className="text-[10px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
        {kicker}
      </p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="font-heading text-3xl font-semibold tabular-nums tracking-tight">
          {value}
        </span>
        {delta !== undefined && delta !== null && (
          <DeltaLabel delta={delta} phaseKind={phaseKind ?? null} />
        )}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </Link>
  );
}

function DeltaLabel({
  delta,
  phaseKind,
}: {
  delta: number;
  phaseKind: PhaseKind | null;
}) {
  const rounded = Math.round(delta * 10) / 10;
  const text = `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)} kg`;

  // Phasengerechte Bewertung: was "gut" ist, hängt vom Ziel ab.
  let good: boolean;
  if (phaseKind === "cut") good = rounded < 0;
  else if (phaseKind === "bulk") good = rounded > 0;
  else good = Math.abs(rounded) <= 0.3; // Maintenance/unbekannt: stabil = gut

  return (
    <span
      className={cn(
        "text-sm font-medium tabular-nums",
        good ? "text-emerald-600" : "text-rose-600",
      )}
    >
      {text}
    </span>
  );
}

function formatKg(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "—";
  return `${v.toFixed(1)} kg`;
}
