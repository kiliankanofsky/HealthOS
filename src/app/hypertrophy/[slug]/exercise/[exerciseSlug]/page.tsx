import Link from "next/link";
import { notFound } from "next/navigation";

import { ExerciseProgressChart } from "@/components/hypertrophy/ExerciseProgressChart";
import { SiblingNavButtons } from "@/components/hypertrophy/SiblingNavButtons";
import { SiblingSwipe } from "@/components/hypertrophy/SiblingSwipe";
import { AppShell } from "@/components/site/AppShell";
import {
  getSetsByTemplateExercise,
  getSwapDatesForTemplateExercise,
  getTemplateBySlug,
  getTemplateExerciseBySlug,
  getTemplateExercises,
} from "@/lib/db/queries";
import { WORKOUT_LABELS } from "@/lib/hypertrophy/workouts";
import { effectiveE1RM, round1 } from "@/lib/utils/strength";

export const dynamic = "force-dynamic";

type Params = { slug: string; exerciseSlug: string };

export default async function ExerciseProgressPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug, exerciseSlug } = await params;
  const template = await getTemplateBySlug(slug);
  if (!template) notFound();

  const row = await getTemplateExerciseBySlug(template.id, exerciseSlug);
  if (!row) notFound();

  const sets = await getSetsByTemplateExercise(row.templateExercise.id);
  // Tage, an denen dieser Slot durch eine andere Übung ersetzt war — sie zählen
  // nicht zum Verlauf der Stamm-Übung, werden aber als Indikator-Punkt gezeigt.
  const swaps = await getSwapDatesForTemplateExercise(row.templateExercise.id);
  const repMin = row.templateExercise.repMin ?? row.exercise.defaultRepMin;
  const repMax = row.templateExercise.repMax ?? row.exercise.defaultRepMax;

  // Sibling-Übungen für Prev/Next-Navigation (Reihenfolge nach `position` aus DB).
  const siblings = await getTemplateExercises(template.id);
  const currentIdx = siblings.findIndex(
    (r) => r.templateExercise.id === row.templateExercise.id,
  );
  const prevExercise = currentIdx > 0 ? siblings[currentIdx - 1] : null;
  const nextExercise =
    currentIdx >= 0 && currentIdx < siblings.length - 1
      ? siblings[currentIdx + 1]
      : null;
  const prevHref = prevExercise
    ? `/hypertrophy/${template.slug}/exercise/${prevExercise.exercise.slug}`
    : null;
  const nextHref = nextExercise
    ? `/hypertrophy/${template.slug}/exercise/${nextExercise.exercise.slug}`
    : null;

  // Stats: bestes e1RM aller Zeit + Datum davon. Score-Berechnung normalisiert
  // unilaterale Sätze über den Weight-Mode.
  let bestE1: {
    value: number;
    date: string;
    weightKg: number;
    reps: number;
    summed: boolean;
  } | null = null;
  for (const s of sets) {
    if (s.reps <= 0) continue;
    const v = effectiveE1RM({
      weightKg: s.weightKg,
      reps: s.reps,
      weightMode: s.weightMode,
      unilateral: row.exercise.unilateral,
    });
    if (bestE1 === null || v > bestE1.value) {
      bestE1 = {
        value: v,
        date: s.date,
        weightKg: s.weightKg,
        reps: s.reps,
        summed: s.weightMode === "summed",
      };
    }
  }
  const totalSets = sets.filter((s) => s.reps > 0).length;
  const sessionsWithExercise = new Set(sets.map((s) => s.date)).size;

  return (
    <AppShell>
      <SiblingSwipe prevHref={prevHref} nextHref={nextHref}>
      <main className="mx-auto w-full max-w-[960px] space-y-8 px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-14">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/hypertrophy/${template.slug}`}
            className="inline-flex items-center gap-1 text-xs tracking-wide uppercase text-muted-foreground hover:text-foreground"
          >
            ← {WORKOUT_LABELS[template.kind]}
          </Link>
          <SiblingNavButtons
            prevHref={prevHref}
            prevTitle={prevExercise?.exercise.name}
            nextHref={nextHref}
            nextTitle={nextExercise?.exercise.name}
          />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
            Übung
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight lg:text-4xl">
            {row.exercise.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Ziel-Range: {repMin}–{repMax} Reps
            {row.exercise.unilateral && " · einarmig"}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sessions" value={String(sessionsWithExercise)} />
        <Stat label="Sätze gesamt" value={String(totalSets)} />
        <Stat
          label="Best e1RM"
          value={bestE1 ? round1(bestE1.value).toString().replace(".", ",") : "—"}
          unit={bestE1 ? "kg" : undefined}
          hint={
            bestE1
              ? `${bestE1.weightKg.toString().replace(".", ",")} kg${bestE1.summed ? " (S)" : ""} × ${bestE1.reps} · ${formatShortDate(bestE1.date)}`
              : undefined
          }
        />
        <Stat
          label="Letzte Session"
          value={sets.length > 0 ? formatShortDate(sets[sets.length - 1].date) : "—"}
        />
      </div>

      <section className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-8">
        <ExerciseProgressChart
          sets={sets}
          unilateral={row.exercise.unilateral}
          swaps={swaps}
        />
      </section>

      <section className="space-y-3">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Alle Sätze
        </p>
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Datum</th>
                <th className="px-4 py-2 text-right">Satz</th>
                <th className="px-4 py-2 text-right">Gewicht</th>
                <th className="px-4 py-2 text-right">Reps</th>
                <th className="px-4 py-2 text-right">e1RM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {[...sets].reverse().map((s) => {
                const e1 =
                  s.reps > 0
                    ? round1(
                        effectiveE1RM({
                          weightKg: s.weightKg,
                          reps: s.reps,
                          weightMode: s.weightMode,
                          unilateral: row.exercise.unilateral,
                        }),
                      )
                    : null;
                const isSummed = s.weightMode === "summed";
                return (
                  <tr key={s.id} className="hover:bg-muted/40">
                    <td className="px-4 py-2">
                      <Link
                        href={`/hypertrophy/${template.slug}/${s.date}`}
                        className="text-foreground hover:underline"
                      >
                        {formatLong(s.date)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {s.setNumber}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        {s.weightKg.toString().replace(".", ",")} kg
                        {isSummed && (
                          <span
                            title="Summiert (beide Seiten)"
                            className="rounded bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-500/25"
                          >
                            S
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {s.reps === 0 ? (
                        <span className="text-muted-foreground italic">übersprungen</span>
                      ) : (
                        s.reps
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {e1 ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {sets.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Noch keine Sätze geloggt.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      </main>
      </SiblingSwipe>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <p className="text-[10px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span>}
      </p>
      {hint && (
        <p className="mt-1 truncate text-xs text-muted-foreground" title={hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y.slice(2)}`;
}

function formatLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
