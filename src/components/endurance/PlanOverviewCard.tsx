import type { TrainingPlan, TrainingPlanWeek } from "@/lib/db/schema";
import { PHASE_LABELS, PHASE_TONE } from "@/lib/endurance/plan-format";

export type OverviewSession = {
  date: string;
  status: string;
  targetDistanceMeters: number | null;
};

type Props = {
  plan: TrainingPlan;
  weeks: TrainingPlanWeek[];
  sessions: OverviewSession[];
  todayIso: string;
};

export function PlanOverviewCard({ plan, weeks, sessions, todayIso }: Props) {
  const total = sessions.length;
  const completed = sessions.filter((s) => s.status === "completed").length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const totalMeters = sessions.reduce(
    (sum, s) => sum + (s.targetDistanceMeters ?? 0),
    0,
  );
  const totalKm = Math.round(totalMeters / 1000);

  const weekly = weeks.map((w) => {
    const meters = sessions
      .filter((s) => s.date >= w.startDate && s.date <= w.endDate)
      .reduce((sum, s) => sum + (s.targetDistanceMeters ?? 0), 0);
    return {
      week: w,
      km: Math.round(meters / 1000),
      isCurrent: w.startDate <= todayIso && w.endDate >= todayIso,
    };
  });
  const maxKm = Math.max(1, ...weekly.map((w) => w.km));
  const avgKm =
    weekly.length > 0
      ? Math.round(weekly.reduce((s, w) => s + w.km, 0) / weekly.length)
      : 0;

  return (
    <section className="flex h-full flex-col rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-7">
      <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        Übersicht
      </p>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <Stat label="Sessions" value={`${completed}/${total}`} />
        <Stat label="Gesamt-km" value={totalKm > 0 ? String(totalKm) : "—"} />
        <Stat
          label="Ø km/Woche"
          value={avgKm > 0 ? String(avgKm) : "—"}
          sub={plan.targetWeeklyKmPeak ? `Peak ${Math.round(plan.targetWeeklyKmPeak)}` : undefined}
        />
      </div>

      {/* Fortschritt */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Fortschritt</span>
          <span>{pct}%</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Wochen-Volumen */}
      {weekly.length > 0 && (
        <div className="mt-6 flex flex-1 flex-col">
          <p className="text-xs text-muted-foreground">Wochen-Volumen (km)</p>
          <div className="mt-3 flex flex-1 items-end gap-0.5" style={{ minHeight: "5rem" }}>
            {weekly.map(({ week, km, isCurrent }) => (
              <div
                key={week.id}
                title={`Woche ${week.weekNumber} · ${PHASE_LABELS[week.phase]} · ${km} km`}
                className="flex flex-1 flex-col items-center justify-end"
              >
                <div
                  className={`w-full rounded-t ${PHASE_TONE[week.phase]} ${
                    isCurrent ? "ring-2 ring-foreground" : ""
                  }`}
                  style={{ height: `${Math.max(4, (km / maxKm) * 72)}px` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>W1</span>
            <span>W{plan.totalWeeks}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-2xl font-semibold leading-none">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
