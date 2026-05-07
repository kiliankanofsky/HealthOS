import { formatKg, formatTrend, type WeightStats } from "@/lib/utils/weight-stats";

type Props = {
  stats: WeightStats;
};

export function WeightStatCards({ stats }: Props) {
  const trend7 = formatTrend(stats.trend7d);
  const trend30 = formatTrend(stats.trend30d);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard
        title="Aktuell"
        value={formatKg(stats.current)}
        description={stats.currentDate ?? "Keine Daten"}
      />
      <StatCard
        title="Trend 7 Tage"
        value={trend7.text}
        description={trendDescription(trend7.direction)}
        valueClassName={trendColorClass(trend7.direction)}
      />
      <StatCard
        title="Trend 30 Tage"
        value={trend30.text}
        description={trendDescription(trend30.direction)}
        valueClassName={trendColorClass(trend30.direction)}
      />
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  valueClassName,
}: {
  title: string;
  value: string;
  description: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-black/5 shadow-sm">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <p
        className={`mt-2 font-heading text-3xl font-semibold tracking-tight ${
          valueClassName ?? "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function trendDescription(dir: "up" | "down" | "flat" | "none"): string {
  switch (dir) {
    case "up":
      return "Zunahme";
    case "down":
      return "Abnahme";
    case "flat":
      return "Stabil";
    case "none":
      return "Nicht genug Daten";
  }
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
