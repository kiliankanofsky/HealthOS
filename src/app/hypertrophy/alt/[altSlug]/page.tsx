import Link from "next/link";
import { notFound } from "next/navigation";

import { ExerciseProgressChart } from "@/components/hypertrophy/ExerciseProgressChart";
import { AppShell } from "@/components/site/AppShell";
import { getAllSwapNames, getSetsForExercise } from "@/lib/db/queries";
import { swapNameToSlug } from "@/lib/hypertrophy/workouts";
import { effectiveE1RM, round1 } from "@/lib/utils/strength";

export const dynamic = "force-dynamic";

type Params = { altSlug: string };

// Progress-Tracker einer getauschten (alternativen) Übung — namens-basiert und
// trainingseinheit-übergreifend. getSetsForExercise vereint Tausch- UND
// Stamm-Verlauf: dieselbe Übung zählt unabhängig davon, ob sie als Slot oder
// als Tausch geloggt wurde.
export default async function SwapExercisePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { altSlug } = await params;

  // Reverse-Lookup: Slug → Name (erster Treffer gewinnt, siehe swapNameToSlug).
  const swapNames = await getAllSwapNames();
  const match = swapNames.find((s) => swapNameToSlug(s.name) === altSlug);
  if (!match) notFound();
  const name = match.name;

  const sets = await getSetsForExercise(name);
  // Bei summiert geloggten Sätzen halbiert effectiveE1RM — also als unilateral
  // behandeln, sobald ein Satz summiert ist (per-side bleibt unberührt).
  const unilateral = sets.some((s) => s.weightMode === "summed");

  // Bestes e1RM aller Zeit + Datum davon.
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
      unilateral,
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
      <main className="mx-auto w-full max-w-[960px] space-y-8 px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-14">
        <header className="space-y-3">
          <Link
            href="/hypertrophy"
            className="inline-flex items-center gap-1 text-xs tracking-wide uppercase text-muted-foreground hover:text-foreground"
          >
            ← Hypertrophy
          </Link>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
              Tausch-Übung
            </p>
            <h1 className="font-heading text-3xl font-semibold tracking-tight lg:text-4xl">
              {name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Verlauf über alle Sessions, in denen diese Übung als Tausch
              eingesetzt wurde.
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
          <ExerciseProgressChart sets={sets} unilateral={unilateral} />
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
                            unilateral,
                          }),
                        )
                      : null;
                  const isSummed = s.weightMode === "summed";
                  return (
                    <tr key={s.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2">{formatLong(s.date)}</td>
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
