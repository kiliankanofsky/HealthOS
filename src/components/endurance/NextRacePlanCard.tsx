import { Flag } from "lucide-react";

import { PlanChat } from "@/components/endurance/PlanChat";
import type { TrainingPlan, TrainingPlanWeek } from "@/lib/db/schema";
import { formatPace, formatSecondsAsHms } from "@/lib/endurance/plan";
import { PHASE_LABELS, PHASE_TONE } from "@/lib/endurance/plan-format";

type Props = {
  plan: TrainingPlan;
  weeks: TrainingPlanWeek[];
  todayIso: string;
};

export function NextRacePlanCard({ plan, weeks, todayIso }: Props) {
  const daysToRace = plan.raceDate ? daysBetween(todayIso, plan.raceDate) : null;
  const currentWeek = weeks.find(
    (w) => w.startDate <= todayIso && w.endDate >= todayIso,
  );

  return (
    <section className="flex h-full flex-col rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-7">
      <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        Next-Race-Plan
      </p>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-heading text-xl font-medium leading-snug">
            {plan.raceName ?? plan.name}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {plan.raceDate ? formatLongDate(plan.raceDate) : "Datum offen"}
          </p>
        </div>
        {daysToRace != null && daysToRace >= 0 && (
          <div className="shrink-0 text-right">
            <p className="font-heading text-3xl font-semibold leading-none text-primary">
              {daysToRace}
            </p>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {daysToRace === 1 ? "Tag" : "Tage"}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <Flag className="size-4 text-muted-foreground" />
          Ziel {formatSecondsAsHms(plan.targetTimeSeconds)}
        </span>
        <span className="text-muted-foreground">
          Pace {formatPace(plan.targetPaceSecPerKm, { withUnit: true })}
        </span>
      </div>

      {/* ---- Phasen-Timeline ---- */}
      {weeks.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Periodisierung</span>
            {currentWeek && (
              <span>
                Woche {currentWeek.weekNumber}/{plan.totalWeeks} ·{" "}
                {PHASE_LABELS[currentWeek.phase]}
              </span>
            )}
          </div>
          <div className="mt-2 flex gap-0.5">
            {weeks.map((w) => (
              <div
                key={w.id}
                title={`Woche ${w.weekNumber} · ${PHASE_LABELS[w.phase]}`}
                className={`h-2.5 flex-1 rounded-full ${PHASE_TONE[w.phase]} ${
                  currentWeek?.id === w.id
                    ? "ring-2 ring-foreground ring-offset-1 ring-offset-card"
                    : ""
                }`}
              />
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
            {phaseLegend(weeks).map((p) => (
              <span
                key={p.phase}
                className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <span className={`size-2 rounded-full ${PHASE_TONE[p.phase]}`} />
                {PHASE_LABELS[p.phase]} ({p.count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ---- KI-Chat (Sprint 5) ---- */}
      <div className="mt-auto border-t border-border/60 pt-5">
        <PlanChat planId={plan.id} />
      </div>
    </section>
  );
}

function phaseLegend(weeks: TrainingPlanWeek[]) {
  const order: TrainingPlanWeek["phase"][] = ["base", "build", "peak", "taper", "race"];
  const counts = new Map<TrainingPlanWeek["phase"], number>();
  for (const w of weeks) counts.set(w.phase, (counts.get(w.phase) ?? 0) + 1);
  return order
    .filter((p) => counts.has(p))
    .map((phase) => ({ phase, count: counts.get(phase)! }));
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`);
  const b = new Date(`${toIso}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function formatLongDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
