import Link from "next/link";

import {
  getAllTemplates,
  getSessionsByTemplate,
  getSetsBySession,
  getTemplateExercises,
} from "@/lib/db/queries";
import {
  WORKOUT_COLORS,
  WORKOUT_LABELS,
  WORKOUT_MARKER_LETTER,
  WORKOUT_ORDER,
} from "@/lib/hypertrophy/workouts";
import { cn } from "@/lib/utils";
import { bestE1RM, round1 } from "@/lib/utils/strength";

// Pro Workout eine Card mit: Marker-Badge, Name, Session-Anzahl, letzte Session.
// Jede Card linkt auf die Workout-Detail-Page. Über den Cards steht EIN
// globaler Cycle — ein Cycle ist eine volle Rotation (Upper A → Lower →
// Upper B), nicht die Ausführungs-Anzahl eines einzelnen Workouts.
export async function WorkoutCards() {
  const templates = await getAllTemplates();
  // In WORKOUT_ORDER sortieren.
  const ordered = WORKOUT_ORDER.map((kind) =>
    templates.find((t) => t.kind === kind),
  ).filter((t): t is NonNullable<typeof t> => t !== undefined);

  // Pre-compute all card data ahead of rendering, weil JSX-map nicht async sein kann.
  const cards = await Promise.all(
    ordered.map(async (tpl) => {
      const sessions = await getSessionsByTemplate(tpl.id);
      const lastSession = sessions[0]; // sessions sind desc nach Datum sortiert
      const sessionCount = sessions.length;
      const colors = WORKOUT_COLORS[tpl.kind];

      // Unilateral-Flag pro Template-Exercise vorhalten, damit
      // effectiveE1RM den Weight-Mode korrekt anwendet.
      const tplExercises = await getTemplateExercises(tpl.id);
      const unilateralByTplExId = new Map(
        tplExercises.map((row) => [row.templateExercise.id, row.exercise.unilateral]),
      );

      const computeTotalE1 = async (sessionId: number): Promise<{ total: number; count: number }> => {
        const sets = await getSetsBySession(sessionId);
        const byExercise = new Map<
          number,
          { weightKg: number; reps: number; weightMode: "per-side" | "summed"; unilateral: boolean }[]
        >();
        for (const s of sets) {
          const unilateral = unilateralByTplExId.get(s.templateExerciseId) ?? false;
          const list = byExercise.get(s.templateExerciseId) ?? [];
          list.push({
            weightKg: s.weightKg,
            reps: s.reps,
            weightMode: s.weightMode,
            unilateral,
          });
          byExercise.set(s.templateExerciseId, list);
        }
        let total = 0;
        for (const ex of byExercise.values()) {
          const best = bestE1RM(ex);
          if (best !== null) total += best;
        }
        return { total, count: sets.filter((s) => s.reps > 0).length };
      };

      // Mini-Stats der letzten Session: Σ Best e1RM + Anzahl Sätze + Trend zur vorletzten.
      let lastSummary: {
        totalE1: number;
        setCount: number;
        delta: number | null;
      } | null = null;
      if (lastSession) {
        const last = await computeTotalE1(lastSession.id);
        let delta: number | null = null;
        const prev = sessions[1];
        if (prev) {
          const prevTotal = (await computeTotalE1(prev.id)).total;
          if (prevTotal > 0) delta = last.total - prevTotal;
        }
        lastSummary = {
          totalE1: round1(last.total),
          setCount: last.count,
          delta,
        };
      }

      return { tpl, lastSession, sessionCount, colors, lastSummary };
    }),
  );

  // Globaler Cycle: wie oft wurde die volle Rotation durchlaufen. Der
  // laufende Cycle ist min(Sessions pro Workout) + 1 — das Workout mit den
  // wenigsten Ausführungen bestimmt, wie viele Rotationen komplett sind.
  const currentCycle =
    cards.length > 0
      ? Math.min(...cards.map((c) => c.sessionCount)) + 1
      : 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Rotation
        </p>
        <p className="font-heading text-sm font-semibold">
          Cycle {currentCycle}
        </p>
        <p className="text-xs text-muted-foreground">
          Ein Cycle = einmal Upper A → Lower → Upper B
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map(({ tpl, lastSession, sessionCount, colors, lastSummary }) => {
        return (
          <Link
            key={tpl.id}
            href={`/hypertrophy/${tpl.slug}`}
            className={cn(
              "group flex flex-col gap-4 overflow-hidden rounded-2xl bg-card p-5 ring-1 ring-foreground/10 shadow-sm",
              "transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-foreground/15",
            )}
          >
            <div className="flex items-center justify-between">
              <span
                aria-hidden
                className={cn(
                  "inline-flex size-9 items-center justify-center rounded-full font-heading text-sm font-semibold text-white",
                  colors.bg,
                )}
              >
                {WORKOUT_MARKER_LETTER[tpl.kind]}
              </span>
              <span className="text-[10px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
                {sessionCount} Sessions
              </span>
            </div>

            <div className="space-y-1">
              <h3 className="font-heading text-2xl font-semibold tracking-tight">
                {WORKOUT_LABELS[tpl.kind]}
              </h3>
              <p className="text-sm text-muted-foreground">
                {lastSession
                  ? `Zuletzt: ${formatRelativeShort(lastSession.date)}`
                  : "Noch kein Training geloggt."}
              </p>
            </div>

            {lastSummary && (
              <div className="grid grid-cols-2 gap-3 border-t border-border/40 pt-3 text-xs">
                <div>
                  <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                    Σ e1RM
                  </p>
                  <p className="mt-0.5 flex items-baseline gap-1.5 tabular-nums">
                    <span className="font-heading text-lg font-semibold">
                      {lastSummary.totalE1.toString().replace(".", ",")}
                    </span>
                    <span className="text-muted-foreground">kg</span>
                    {lastSummary.delta !== null && (
                      <DeltaPill delta={lastSummary.delta} />
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                    Sätze
                  </p>
                  <p className="mt-0.5 font-heading text-lg font-semibold tabular-nums">
                    {lastSummary.setCount}
                  </p>
                </div>
              </div>
            )}

            <span
              aria-hidden
              className="mt-auto self-end text-lg text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
            >
              →
            </span>
          </Link>
        );
      })}
      </div>
    </div>
  );
}

function DeltaPill({ delta }: { delta: number }) {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) {
    return (
      <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
        ±0
      </span>
    );
  }
  const positive = rounded > 0;
  return (
    <span
      className={cn(
        "rounded-full px-1.5 text-[10px] font-medium",
        positive
          ? "bg-emerald-500/15 text-emerald-700"
          : "bg-rose-500/15 text-rose-700",
      )}
    >
      {positive ? "+" : ""}
      {rounded.toString().replace(".", ",")}
    </span>
  );
}

function formatRelativeShort(iso: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${iso}T00:00:00`);
  const diffDays = Math.round(
    (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "heute";
  if (diffDays === 1) return "gestern";
  if (diffDays < 7) return `vor ${diffDays} Tagen`;
  if (diffDays < 14) return "letzte Woche";
  if (diffDays < 30) return `vor ${Math.round(diffDays / 7)} Wochen`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}
