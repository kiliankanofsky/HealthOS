import {
  diff,
  formatAvg,
  formatKg,
  formatTrend,
  type WeightStats,
} from "@/lib/utils/weight-stats";

type Props = {
  stats: WeightStats;
};

export function WeightStatCards({ stats }: Props) {
  // Vergleichswerte: aktueller Wochenschnitt vs. Vorwoche / vs. 4-Wochen-Baseline.
  const weekVsPrev = diff(stats.weekAvg.avg, stats.prevWeekAvg.avg);
  const weekVsBaseline = diff(stats.weekAvg.avg, stats.fourWeekAvg.avg);

  const weekTrend = formatTrend(weekVsPrev);
  const baselineTrend = formatTrend(weekVsBaseline);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard
        title="Aktuell"
        value={formatKg(stats.current)}
        description={stats.currentDate ?? "Keine Daten"}
      />
      <StatCard
        title="Diese Woche"
        value={formatAvg(stats.weekAvg.avg)}
        secondary={weekTrend.text}
        secondaryClassName={trendColorClass(weekTrend.direction)}
        description={
          stats.prevWeekAvg.avg !== null
            ? `vs. Vorwoche ${formatAvg(stats.prevWeekAvg.avg)}`
            : "Keine Vergleichswoche"
        }
      />
      <StatCard
        title="Diese Woche"
        value={formatAvg(stats.weekAvg.avg)}
        secondary={baselineTrend.text}
        secondaryClassName={trendColorClass(baselineTrend.direction)}
        description={
          stats.fourWeekAvg.avg !== null
            ? `vs. 4-Wochen-Schnitt ${formatAvg(stats.fourWeekAvg.avg)}`
            : "Keine 4-Wochen-Baseline"
        }
      />
    </div>
  );
}

function StatCard({
  title,
  value,
  secondary,
  secondaryClassName,
  description,
}: {
  title: string;
  value: string;
  secondary?: string;
  secondaryClassName?: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-black/5 shadow-sm">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="font-heading text-3xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        {secondary && (
          <p
            className={`text-sm font-medium tabular-nums ${
              secondaryClassName ?? "text-muted-foreground"
            }`}
          >
            {secondary}
          </p>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function trendColorClass(dir: "up" | "down" | "flat" | "none"): string {
  switch (dir) {
    case "up":
      return "text-orange-600";
    case "down":
      return "text-emerald-600";
    case "flat":
      return "text-muted-foreground";
    case "none":
      return "text-muted-foreground";
  }
}
