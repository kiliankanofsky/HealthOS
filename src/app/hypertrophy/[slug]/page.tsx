import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getAllExerciseNamesEverUsed,
  getSessionsByTemplate,
  getSetsBySession,
  getTemplateBySlug,
  getTemplateExercises,
} from "@/lib/db/queries";
import { UnitExerciseManager } from "@/components/hypertrophy/UnitExerciseManager";
import { WorkoutAvatarPanel } from "@/components/hypertrophy/avatar/WorkoutAvatarPanel";
import type { MuscleExerciseEntry } from "@/components/hypertrophy/avatar/MuscleExerciseList";
import { WorkoutOverviewChart } from "@/components/hypertrophy/WorkoutOverviewChart";
import {
  aggregateWorkoutMuscles,
  DB_MUSCLE_SLUGS,
  type DbMuscleSlug,
  type HighlightLevel,
} from "@/lib/hypertrophy/muscles";
import { templateVisuals } from "@/lib/hypertrophy/workouts";
import { cn } from "@/lib/utils";

import { OpenOrCreateSessionButton } from "@/components/hypertrophy/OpenOrCreateSessionButton";
import { AppShell } from "@/components/site/AppShell";

export const dynamic = "force-dynamic";

type Params = { slug: string };

export default async function WorkoutPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const template = await getTemplateBySlug(slug);
  if (!template) notFound();

  const exerciseRows = await getTemplateExercises(template.id);
  const sessions = await getSessionsByTemplate(template.id);
  const exerciseNames = await getAllExerciseNamesEverUsed();
  const { colors, label: templateLabel, letter } = templateVisuals(template);

  // Slots für den Übungs-Manager (add/remove/reorder).
  const unitSlots = exerciseRows.map((row) => ({
    templateExerciseId: row.templateExercise.id,
    name: row.exercise.name,
    slug: row.exercise.slug,
    repMin: row.templateExercise.repMin ?? row.exercise.defaultRepMin,
    repMax: row.templateExercise.repMax ?? row.exercise.defaultRepMax,
    defaultSets: row.templateExercise.defaultSets,
  }));

  // Avatar: aggregierte Muskel-Highlights ("höchste Stufe gewinnt") +
  // Übungs-Index pro DB-Slug für die Hover-/Tap-Liste.
  const muscleHighlights = aggregateWorkoutMuscles(
    exerciseRows.map((r) => ({
      primaryMuscles: r.exercise.primaryMuscles,
      secondaryMuscles: r.exercise.secondaryMuscles,
    })),
  );
  const exercisesByMuscle = new Map<DbMuscleSlug, MuscleExerciseEntry[]>();
  const isDbSlug = (s: string): s is DbMuscleSlug =>
    (DB_MUSCLE_SLUGS as readonly string[]).includes(s);
  const ensureList = (slug: DbMuscleSlug) => {
    let list = exercisesByMuscle.get(slug);
    if (!list) {
      list = [];
      exercisesByMuscle.set(slug, list);
    }
    return list;
  };
  for (const row of exerciseRows) {
    const entryBase = {
      exerciseSlug: row.exercise.slug,
      exerciseName: row.exercise.name,
      position: row.templateExercise.position,
      unilateral: row.exercise.unilateral,
    };
    for (const slug of row.exercise.primaryMuscles) {
      if (!isDbSlug(slug)) continue;
      ensureList(slug).push({ ...entryBase, level: "primary" });
    }
    for (const slug of row.exercise.secondaryMuscles) {
      if (!isDbSlug(slug)) continue;
      const list = ensureList(slug);
      // Falls die Übung den Muskel zugleich als primary listet, wird sie nur
      // als primary aufgeführt (kein Doppel-Eintrag in der Sheet-Liste).
      if (list.some((e) => e.exerciseSlug === entryBase.exerciseSlug)) continue;
      list.push({ ...entryBase, level: "secondary" });
    }
  }
  const highlightsEntries: [DbMuscleSlug, HighlightLevel][] = [
    ...muscleHighlights.entries(),
  ];
  const exercisesByMuscleEntries: [DbMuscleSlug, MuscleExerciseEntry[]][] = [
    ...exercisesByMuscle.entries(),
  ];

  // Aggregierte Daten pro Session für den Übersichts-Chart.
  // Cycle-Nummer = chronologischer Index (älteste = 1).
  const sessionsAsc = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const aggregateSessions = await Promise.all(sessionsAsc.map(async (s, idx) => {
    const sets = await getSetsBySession(s.id);
    const setsByExercise = new Map<
      number,
      { weightKg: number; reps: number; weightMode: "per-side" | "summed" }[]
    >();
    for (const set of sets) {
      const list = setsByExercise.get(set.templateExerciseId) ?? [];
      list.push({
        weightKg: set.weightKg,
        reps: set.reps,
        weightMode: set.weightMode,
      });
      setsByExercise.set(set.templateExerciseId, list);
    }
    return {
      date: s.date,
      cycle: idx + 1,
      exercises: exerciseRows.map((row) => ({
        unilateral: row.exercise.unilateral,
        setsForChart: setsByExercise.get(row.templateExercise.id) ?? [],
      })),
    };
  }));

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1100px] space-y-10 px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-14">
      <header className="space-y-3">
        <Link
          href="/hypertrophy"
          className="inline-flex items-center gap-1 text-xs tracking-[0.18em] uppercase text-muted-foreground hover:text-foreground"
        >
          ← Hypertrophy
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <span
              aria-hidden
              className={cn(
                "inline-flex size-12 items-center justify-center rounded-full font-heading text-lg font-semibold text-white",
                colors.bg,
              )}
            >
              {letter}
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
                Workout
              </p>
              <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                {templateLabel}
              </h1>
              <p className="text-sm text-muted-foreground">
                {sessions.length} Sessions · {exerciseRows.length} Übungen
              </p>
            </div>
          </div>
          <OpenOrCreateSessionButton templateSlug={template.slug} />
        </div>
      </header>

      <section className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-8">
        <WorkoutOverviewChart sessions={aggregateSessions} templateSlug={template.slug} />
      </section>

      <WorkoutAvatarPanel
        templateSlug={template.slug}
        highlightsEntries={highlightsEntries}
        exercisesByMuscleEntries={exercisesByMuscleEntries}
      />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            Übungen
          </p>
          <UnitExerciseManager
            templateId={template.id}
            slots={unitSlots}
            exerciseNames={exerciseNames}
          />
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {exerciseRows.map((row, i) => {
            const repMin = row.templateExercise.repMin ?? row.exercise.defaultRepMin;
            const repMax = row.templateExercise.repMax ?? row.exercise.defaultRepMax;
            return (
              <Link
                key={row.templateExercise.id}
                href={`/hypertrophy/${template.slug}/exercise/${row.exercise.slug}`}
                className="group flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40"
              >
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.exercise.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {repMin}–{repMax} Reps
                    {row.exercise.unilateral && " · einarmig"}
                  </p>
                </div>
                <span
                  aria-hidden
                  className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                >
                  →
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Vergangene Sessions
        </p>
        {sessions.length === 0 ? (
          <p className="rounded-xl bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            Noch nichts geloggt. Lege oben rechts eine neue Session an.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
            {sessions.map((s, idx) => (
              <li key={s.id}>
                <Link
                  href={`/hypertrophy/${template.slug}/${s.date}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{formatLong(s.date)}</p>
                    <p className="text-xs text-muted-foreground">
                      {sessions.length - idx}. Session
                    </p>
                  </div>
                  <span
                    aria-hidden
                    className="text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      </main>
    </AppShell>
  );
}

function formatLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const weekday = d.toLocaleDateString("de-DE", { weekday: "short" });
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleDateString("de-DE", { month: "long" });
  const year = d.getFullYear();
  return `${weekday}, ${day}. ${month} ${year}`;
}
