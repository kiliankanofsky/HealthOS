import Link from "next/link";
import { notFound } from "next/navigation";

import { DeleteSessionButton } from "@/components/hypertrophy/DeleteSessionButton";
import { SessionLogger } from "@/components/hypertrophy/SessionLogger";
import { SiblingNavButtons } from "@/components/hypertrophy/SiblingNavButtons";
import { SiblingSwipe } from "@/components/hypertrophy/SiblingSwipe";
import { AppShell } from "@/components/site/AppShell";
import {
  cycleNumberFor,
  getAllPhases,
  getAllSessions,
  getAllTemplates,
  getOverridesForSession,
  getPreviousSessionSetsForSlot,
  getSession,
  getSessionsByTemplate,
  getSetsBySession,
  getTemplateBySlug,
  getTemplateExercises,
  getDailyTagForDate,
  previousDayIso,
} from "@/lib/db/queries";
import {
  WORKOUT_COLORS,
  WORKOUT_LABELS,
  WORKOUT_MARKER_LETTER,
} from "@/lib/hypertrophy/workouts";
import type { PhaseKind } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const PHASE_LABELS: Record<PhaseKind, string> = {
  bulk: "Aufbau",
  cut: "Defizit",
  maintenance: "Erhaltung",
};

const PHASE_PILL: Record<PhaseKind, string> = {
  bulk: "bg-violet-500/12 text-violet-700 ring-violet-500/25",
  cut: "bg-teal-500/12 text-teal-700 ring-teal-500/25",
  maintenance: "bg-muted text-muted-foreground ring-muted-foreground/20",
};

type Params = { slug: string; date: string };
type SearchParams = { scope?: string };

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug, date } = await params;
  const { scope } = await searchParams;
  if (!DATE_REGEX.test(date)) notFound();

  const template = await getTemplateBySlug(slug);
  if (!template) notFound();

  const session = await getSession(template.id, date);
  if (!session) notFound();

  const exerciseRows = await getTemplateExercises(template.id);
  const sets = await getSetsBySession(session.id);
  const overrides = await getOverridesForSession(session.id);
  const overrideByTemplateExerciseId = new Map(
    overrides.map((o) => [o.templateExerciseId, o.name]),
  );
  const cycle = await cycleNumberFor(template.id, date);
  // Cheat-Day / Alkohol vom Vortag — sie wirken auf das Training am Folgetag.
  const previousDay = previousDayIso(date);
  // Tags (Cheat-Day / Alkohol) wandern in daily_tags — siehe Migration 0012.
  const previousEntry = await getDailyTagForDate(previousDay);
  const phase = await findPhaseFor(date);
  const colors = WORKOUT_COLORS[template.kind];

  // Sibling-Sessions für Prev/Next-Navigation. Scope steuert die Kette:
  //   scope === "all" → über alle Workout-Typen hinweg (z.B. via Kalender)
  //   sonst           → nur Sessions desselben Templates
  const isAllScope = scope === "all";
  const sessionList = isAllScope
    ? await getAllSessions()
    : await getSessionsByTemplate(template.id);
  const templateById = new Map(
    (await getAllTemplates()).map((t) => [t.id, t]),
  );
  // sessionList ist desc nach Datum sortiert (neueste zuerst).
  const currentIdx = sessionList.findIndex((s) => s.id === session.id);
  const newerSession =
    currentIdx > 0 ? sessionList[currentIdx - 1] : null;
  const olderSession =
    currentIdx >= 0 && currentIdx < sessionList.length - 1
      ? sessionList[currentIdx + 1]
      : null;
  const buildSessionHref = (s: { templateId: number; date: string }) => {
    const tpl = templateById.get(s.templateId);
    if (!tpl) return null;
    return `/hypertrophy/${tpl.slug}/${s.date}${isAllScope ? "?scope=all" : ""}`;
  };
  // ←-Button = chronologisch ältere Session, →-Button = neuere.
  const prevHref = olderSession ? buildSessionHref(olderSession) : null;
  const nextHref = newerSession ? buildSessionHref(newerSession) : null;
  const prevTitle = olderSession ? formatLong(olderSession.date) : undefined;
  const nextTitle = newerSession ? formatLong(newerSession.date) : undefined;

  // Sets pro template_exercise gruppieren.
  const setsByExercise = new Map<number, typeof sets>();
  for (const s of sets) {
    const list = setsByExercise.get(s.templateExerciseId) ?? [];
    list.push(s);
    setsByExercise.set(s.templateExerciseId, list);
  }

  return (
    <AppShell>
      <SiblingSwipe prevHref={prevHref} nextHref={nextHref}>
      <main className="mx-auto w-full max-w-[960px] space-y-8 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={isAllScope ? "/hypertrophy" : `/hypertrophy/${template.slug}`}
            className="inline-flex items-center gap-1 text-xs tracking-wide uppercase text-muted-foreground hover:text-foreground"
          >
            ← {isAllScope ? "Hypertrophy" : WORKOUT_LABELS[template.kind]}
          </Link>
          <SiblingNavButtons
            prevHref={prevHref}
            prevTitle={prevTitle}
            nextHref={nextHref}
            nextTitle={nextTitle}
          />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <span
              aria-hidden
              className={cn(
                "inline-flex size-12 items-center justify-center rounded-full font-heading text-lg font-semibold text-white",
                colors.bg,
              )}
            >
              {WORKOUT_MARKER_LETTER[template.kind]}
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
                Session
              </p>
              <h1 className="font-heading text-3xl font-semibold tracking-tight lg:text-4xl">
                {formatLong(date)}
              </h1>
              <p className="text-sm text-muted-foreground">
                {WORKOUT_LABELS[template.kind]} · Cycle {cycle} · KW {isoWeek(date)}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {phase && (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
              PHASE_PILL[phase],
            )}
          >
            {PHASE_LABELS[phase]}
          </span>
        )}
        {previousEntry?.cheatDay && (
          <span
            className="rounded-full bg-amber-500/12 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-500/25"
            title={`Vortag (${previousDay})`}
          >
            Cheat Day (Vortag)
          </span>
        )}
        {previousEntry?.alcohol && (
          <span
            className="rounded-full bg-rose-500/12 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-500/25"
            title={`Vortag (${previousDay})`}
          >
            Alkohol (Vortag)
          </span>
        )}
        <span className="rounded-full bg-muted text-muted-foreground/70 px-2.5 py-0.5 text-xs font-medium ring-1 ring-muted-foreground/15">
          Schlaf —
        </span>
      </div>

      <SessionLogger
        sessionId={session.id}
        templateSlug={template.slug}
        exerciseRows={await Promise.all(exerciseRows.map(async (row) => {
          const overrideName =
            overrideByTemplateExerciseId.get(row.templateExercise.id) ?? null;
          const previous = await getPreviousSessionSetsForSlot(
            row.templateExercise.id,
            session.id,
            date,
          );
          // Vergleich nur sinnvoll, wenn die letzte Session denselben Übungs-Namen
          // hatte wie die aktuelle (Override oder Stamm).
          const currentName = overrideName ?? row.exercise.name;
          const previousName = previous?.overrideName ?? row.exercise.name;
          const previousSets =
            previous && currentName.toLowerCase() === previousName.toLowerCase()
              ? { date: previous.date, sets: previous.sets }
              : null;
          return {
            templateExerciseId: row.templateExercise.id,
            name: row.exercise.name,
            exerciseSlug: row.exercise.slug,
            overrideName,
            unilateral: row.exercise.unilateral,
            repMin: row.templateExercise.repMin ?? row.exercise.defaultRepMin,
            repMax: row.templateExercise.repMax ?? row.exercise.defaultRepMax,
            sets: setsByExercise.get(row.templateExercise.id) ?? [],
            previousSets,
          };
        }))}
      />

      <div className="flex justify-end pt-4">
        <DeleteSessionButton
          sessionId={session.id}
          templateSlug={template.slug}
          dateLabel={formatLong(date)}
        />
      </div>
      </main>
      </SiblingSwipe>
    </AppShell>
  );
}

function formatLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const weekday = d.toLocaleDateString("de-DE", { weekday: "long" });
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString("de-DE", { month: "long" });
  const year = d.getFullYear();
  return `${weekday}, ${day}. ${month} ${year}`;
}

function isoWeek(iso: string): number {
  // ISO 8601 KW
  const d = new Date(`${iso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = (d.getTime() - firstThursday.getTime()) / 86400000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

async function findPhaseFor(iso: string): Promise<PhaseKind | null> {
  const phases = await getAllPhases();
  for (const p of phases) {
    if (p.startDate <= iso && (p.endDate === null || p.endDate >= iso)) {
      return p.kind;
    }
  }
  return null;
}
