import { ArrowRight, Calendar, Target } from "lucide-react";
import Link from "next/link";

import { PlanGeneratorButton } from "@/components/endurance/PlanGeneratorButton";
import { AppShell } from "@/components/site/AppShell";
import {
  getCurrentTrainingPlan,
  getSessionsForPlan,
  getWeeksForPlan,
} from "@/lib/db/queries";
import type { TrainingPlan } from "@/lib/db/schema";
import { formatPace, formatSecondsAsHms } from "@/lib/endurance/plan";

export const dynamic = "force-dynamic";
// Server-Action `generatePlanSessions` ruft Claude in 4 Chunks auf — bis ~50s
// pro Plan. Vercel-Hobby maxDuration auf 60s setzen.
export const maxDuration = 60;

export default async function EnduranceRecommendationsPage() {
  const plan = await getCurrentTrainingPlan();

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1280px] space-y-10 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
        <header className="space-y-2">
          <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
            Endurance · Empfohlene Trainings
          </p>
          <h1 className="font-heading text-4xl font-semibold tracking-tight lg:text-5xl">
            Goal-Race-Plan
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Dein anpassbarer Trainingsplan — KI-generiert, manuell editierbar,
            und an deine aktuellen Daten gekoppelt.
          </p>
        </header>

        {plan ? <ActivePlanCard plan={plan} /> : <EmptyState />}
      </main>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <section className="rounded-3xl bg-card p-10 text-center ring-1 ring-black/5 shadow-sm">
      <Target className="mx-auto mb-4 size-10 text-primary" />
      <h2 className="font-heading text-2xl font-medium">Noch kein Plan</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Lege deinen ersten Goal-Race-Plan an. Du brauchst nur Race-Datum,
        Zielzeit und optional eine Referenz-PDF.
      </p>
      <Link
        href="/endurance/recommendations/setup"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Plan anlegen
        <ArrowRight className="size-4" />
      </Link>
    </section>
  );
}

async function ActivePlanCard({ plan }: { plan: TrainingPlan }) {
  const [weeks, sessions] = await Promise.all([
    getWeeksForPlan(plan.id),
    getSessionsForPlan(plan.id),
  ]);
  // Button immer zeigen wenn draft — egal ob Sessions schon teilweise da sind.
  // Der Button unterscheidet selbst zwischen "neu" und "fortsetzen".
  const showGenerator = plan.status === "draft";

  const targetTime = formatSecondsAsHms(plan.targetTimeSeconds);
  const targetPace = formatPace(plan.targetPaceSecPerKm, { withUnit: true });

  return (
    <section className="space-y-6">
      <div className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {plan.raceName ?? "Goal Race"}
            </p>
            <h2 className="mt-1 font-heading text-2xl font-medium">
              {plan.name}
            </h2>
          </div>
          <StatusBadge status={plan.status} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Race-Datum" value={plan.raceDate ?? "—"} />
          <Stat label="Zielzeit" value={targetTime} />
          <Stat label="Ziel-Pace" value={targetPace} />
          <Stat label="Wochen" value={String(plan.totalWeeks)} />
          <Stat label="Plan-Start" value={plan.planStartDate} />
          <Stat
            label="Peak-km/Woche"
            value={plan.targetWeeklyKmPeak ? String(plan.targetWeeklyKmPeak) : "—"}
          />
          <Stat
            label="Sessions/Woche"
            value={plan.sessionsPerWeek ? String(plan.sessionsPerWeek) : "—"}
          />
          <Stat
            label="Referenz-PDF"
            value={plan.referencePdfName ?? "—"}
          />
        </div>
      </div>

      {showGenerator && (
        <div className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-8">
          <PlanGeneratorButton
            planId={plan.id}
            existingPrimarySessionCount={sessions.length}
          />
        </div>
      )}

      <div className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-heading text-lg font-medium">
              Wochenstruktur
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {weeks.length} Wochen angelegt ·{" "}
              {sessions.length > 0
                ? `${sessions.length} Sessions generiert`
                : "Sessions noch nicht generiert"}
            </p>
          </div>
          <Calendar className="size-5 text-muted-foreground" />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {weeks.map((w) => (
            <div
              key={w.id}
              className="rounded-xl bg-muted/40 p-3 text-center"
            >
              <p className="text-xs font-medium text-muted-foreground">
                Woche {w.weekNumber}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-foreground/70">
                {w.phase}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {w.startDate.slice(5)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Das volle 4-Card-Layout (Kalender · Nächste Session · Next-Race-Plan ·
        Übersicht) kommt in Sprint 4.{" "}
        <Link
          href="/endurance/recommendations/setup"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Neuen Plan anlegen
        </Link>
      </p>
    </section>
  );
}

// Visuell unterscheiden, damit User auf einen Blick sieht, ob der Plan
// schon "live" ist (active) oder noch in Bearbeitung (draft).
function StatusBadge({ status }: { status: TrainingPlan["status"] }) {
  const tone: Record<TrainingPlan["status"], string> = {
    draft: "bg-amber-100 text-amber-900",
    active: "bg-emerald-100 text-emerald-900",
    completed: "bg-sky-100 text-sky-900",
    archived: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider ${tone[status]}`}
    >
      {status}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-base text-foreground">{value}</p>
    </div>
  );
}
