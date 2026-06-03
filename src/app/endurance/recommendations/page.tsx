import { ArrowRight, Calendar, Settings2, Target } from "lucide-react";
import Link from "next/link";

import { NextRacePlanCard } from "@/components/endurance/NextRacePlanCard";
import {
  PlanBoard,
  type NextSessionData,
} from "@/components/endurance/PlanBoard";
import type { CalendarSession } from "@/components/endurance/PlanCalendar";
import { PlanGeneratorButton } from "@/components/endurance/PlanGeneratorButton";
import { PlanOverviewCard } from "@/components/endurance/PlanOverviewCard";
import { AppShell } from "@/components/site/AppShell";
import {
  getBlocksForPlanSession,
  getCurrentTrainingPlan,
  getNextPlanSession,
  getSessionsForPlan,
  getWeeksForPlan,
} from "@/lib/db/queries";
import type { TrainingPlan, TrainingPlanSession } from "@/lib/db/schema";
import { formatPace, formatSecondsAsHms } from "@/lib/endurance/plan";
import { toLocalISODate } from "@/lib/utils/date";

export const dynamic = "force-dynamic";
// Server-Action `generatePlanSessions` (Draft-Fall) ruft Claude pro Chunk auf.
// Vercel-Hobby maxDuration auf 60s setzen.
export const maxDuration = 60;

export default async function EnduranceRecommendationsPage() {
  const plan = await getCurrentTrainingPlan();

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1280px] space-y-8 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
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

        {plan ? <PlanView plan={plan} /> : <EmptyState />}
      </main>
    </AppShell>
  );
}

// Mapping Plan-Session → schlanke Kalender-Darstellung (nur was die Pille braucht).
function toCalendarSession(s: TrainingPlanSession): CalendarSession {
  return {
    id: s.id,
    date: s.date,
    dayOrder: s.dayOrder,
    sessionType: s.sessionType,
    title: s.title,
    status: s.status,
    targetDistanceMeters: s.targetDistanceMeters,
    targetDurationSec: s.targetDurationSec,
    primaryZone: s.primaryZone,
  };
}

async function PlanView({ plan }: { plan: TrainingPlan }) {
  const [weeks, sessions] = await Promise.all([
    getWeeksForPlan(plan.id),
    getSessionsForPlan(plan.id),
  ]);

  // Noch keine Sessions generiert → Generator-Ansicht (Draft-Fall).
  if (sessions.length === 0) {
    return <SetupPending plan={plan} weeks={weeks} />;
  }

  const todayIso = toLocalISODate();
  const next = await getNextPlanSession(plan.id, todayIso);
  const nextBlocks = next ? await getBlocksForPlanSession(next.id) : [];

  const nextData: NextSessionData | null = next
    ? {
        ...toCalendarSession(next),
        blocks: nextBlocks.map((b) => ({
          repetitions: b.repetitions,
          description: b.description,
          segmentsJson: b.segmentsJson,
        })),
      }
    : null;

  // Kalender soll im Monat der nächsten Session starten (bzw. ab Plan-Start,
  // wenn der Plan noch in der Zukunft liegt).
  const initialMonth =
    next?.date ?? (todayIso >= plan.planStartDate ? todayIso : plan.planStartDate);

  return (
    <section className="space-y-6">
      <PlanHeader plan={plan} />

      {/* Reihe 1: Kalender (Drag-and-Drop) + Nächste Session */}
      <PlanBoard
        planId={plan.id}
        sessions={sessions.map(toCalendarSession)}
        nextSession={nextData}
        planStartDate={plan.planStartDate}
        raceDate={plan.raceDate}
        paceZones={plan.paceZonesJson ?? null}
        initialMonth={initialMonth}
        todayIso={todayIso}
      />

      {/* Reihe 2: Next-Race-Plan (mit Chat) + Übersicht */}
      <div className="grid gap-6 lg:grid-cols-2">
        <NextRacePlanCard plan={plan} weeks={weeks} todayIso={todayIso} />
        <PlanOverviewCard
          plan={plan}
          weeks={weeks}
          sessions={sessions.map((s) => ({
            date: s.date,
            status: s.status,
            targetDistanceMeters: s.targetDistanceMeters,
          }))}
          todayIso={todayIso}
        />
      </div>
    </section>
  );
}

// Schlanke Kopfzeile über den Cards: Name, Status, Link zum Setup.
function PlanHeader({ plan }: { plan: TrainingPlan }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card px-5 py-3.5 ring-1 ring-black/5 shadow-sm">
      <div className="flex items-center gap-3">
        <h2 className="font-heading text-lg font-medium">{plan.name}</h2>
        <StatusBadge status={plan.status} />
      </div>
      <Link
        href="/endurance/recommendations/setup"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <Settings2 className="size-4" />
        Plan ändern
      </Link>
    </div>
  );
}

// Draft ohne Sessions: Plan-Summary + KI-Generator + Wochen-Grid.
function SetupPending({
  plan,
  weeks,
}: {
  plan: TrainingPlan;
  weeks: Awaited<ReturnType<typeof getWeeksForPlan>>;
}) {
  return (
    <section className="space-y-6">
      <div className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {plan.raceName ?? "Goal Race"}
            </p>
            <h2 className="mt-1 font-heading text-2xl font-medium">{plan.name}</h2>
          </div>
          <StatusBadge status={plan.status} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Race-Datum" value={plan.raceDate ?? "—"} />
          <Stat label="Zielzeit" value={formatSecondsAsHms(plan.targetTimeSeconds)} />
          <Stat
            label="Ziel-Pace"
            value={formatPace(plan.targetPaceSecPerKm, { withUnit: true })}
          />
          <Stat label="Wochen" value={String(plan.totalWeeks)} />
        </div>
      </div>

      <div className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-8">
        <PlanGeneratorButton planId={plan.id} existingPrimarySessionCount={0} />
      </div>

      <div className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-heading text-lg font-medium">Wochenstruktur</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {weeks.length} Wochen angelegt · Sessions noch nicht generiert
            </p>
          </div>
          <Calendar className="size-5 text-muted-foreground" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {weeks.map((w) => (
            <div key={w.id} className="rounded-xl bg-muted/40 p-3 text-center">
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
    </section>
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

// Visuell unterscheiden, ob der Plan schon „live" ist (active) oder in Bearbeitung.
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
