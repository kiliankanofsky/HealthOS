import Link from "next/link";

import { RotationManagerDialog } from "@/components/hypertrophy/RotationManagerDialog";
import {
  getManageableTemplates,
  getRotationTemplates,
  getSessionsByTemplate,
  getSetsBySession,
  getTemplateExercises,
} from "@/lib/db/queries";
import { templateVisuals } from "@/lib/hypertrophy/workouts";
import { cn } from "@/lib/utils";
import { bestE1RM, round1 } from "@/lib/utils/strength";

// Rotation = die aktuell aktiven Trainingseinheiten. Eine Card pro Einheit
// (dynamische Anzahl, Farbe/Buchstabe aus dem Template-Row). Über den
// "Rotation verwalten"-Button (RotationManagerDialog) lassen sich Einheiten in
// die Rotation aufnehmen/entfernen, umbenennen, umfärben, sortieren und
// archivieren. Vergangene Sessions bleiben unabhängig von der Rotation
// indiziert (Kalender/History/Detail ziehen über getAllTemplates/Slug).
export async function RotationSection() {
  const [rotation, manageable] = await Promise.all([
    getRotationTemplates(),
    getManageableTemplates(),
  ]);

  // Pro Rotations-Einheit Card-Daten + Session-Zahl (für Cycle + Card).
  const cards = await Promise.all(
    rotation.map(async (tpl) => {
      const sessions = await getSessionsByTemplate(tpl.id);
      const lastSession = sessions[0]; // desc nach Datum
      const tplExercises = await getTemplateExercises(tpl.id);
      const unilateralByTplExId = new Map(
        tplExercises.map((row) => [
          row.templateExercise.id,
          row.exercise.unilateral,
        ]),
      );

      const computeTotalE1 = async (
        sessionId: number,
      ): Promise<{ total: number; count: number }> => {
        const sets = await getSetsBySession(sessionId);
        const byExercise = new Map<
          number,
          {
            weightKg: number;
            reps: number;
            weightMode: "per-side" | "summed";
            unilateral: boolean;
          }[]
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

      return {
        tpl,
        visuals: templateVisuals(tpl),
        lastSession,
        sessionCount: sessions.length,
        lastSummary,
      };
    }),
  );

  // Globaler Cycle: min(Sessions je Rotations-Einheit) + 1.
  const currentCycle =
    cards.length > 0 ? Math.min(...cards.map((c) => c.sessionCount)) + 1 : 1;

  // Session-Zahlen für den Manager (Löschen vs. Archivieren-Hinweis).
  const sessionCountById = new Map(
    cards.map((c) => [c.tpl.id, c.sessionCount]),
  );
  const managerUnits = await Promise.all(
    manageable.map(async (t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      color: t.color,
      letter: templateVisuals(t).letter,
      inRotation: t.inRotation,
      sessionCount:
        sessionCountById.get(t.id) ??
        (await getSessionsByTemplate(t.id)).length,
    })),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            Rotation
          </p>
          <p className="font-heading text-sm font-semibold">
            Cycle {currentCycle}
          </p>
          <p className="text-xs text-muted-foreground">
            {cards.length > 0
              ? `Ein Cycle = einmal ${cards.map((c) => c.visuals.label).join(" → ")}`
              : "Keine Einheit in der Rotation"}
          </p>
        </div>
        <RotationManagerDialog units={managerUnits} />
      </div>

      {cards.length === 0 ? (
        <p className="rounded-2xl bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
          Noch keine Einheit in der Rotation. Lege über den grauen Button eine
          neue Trainingseinheit an oder aktiviere bestehende über Rotation
          verwalten.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ tpl, visuals, lastSession, sessionCount, lastSummary }) => (
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
                    visuals.colors.bg,
                  )}
                >
                  {visuals.letter}
                </span>
                <span className="text-[10px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
                  {sessionCount} Sessions
                </span>
              </div>

              <div className="space-y-1">
                <h3 className="font-heading text-2xl font-semibold tracking-tight">
                  {visuals.label}
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
          ))}
        </div>
      )}
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
