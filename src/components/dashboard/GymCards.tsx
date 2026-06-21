import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { GymSessionSummary } from "@/lib/dashboard/gym";
import { paletteClasses } from "@/lib/hypertrophy/workouts";
import { cn } from "@/lib/utils";

// Hypertrophy-Sektion der Startseite: letzte Gym-Session (mit Σe1RM-Delta,
// verlinkt auf die Session-Detail-Seite) + das laut Rotation nächste Workout.

export type RotationUnit = {
  slug: string;
  name: string;
  color: string | null;
  letter: string;
};

type Props = {
  summaries: GymSessionSummary[];
  rotation: RotationUnit[];
  todayIso: string;
};

export function GymCards({ summaries, rotation, todayIso }: Props) {
  const last = summaries[0] ?? null;

  // Nächste Einheit laut Rotations-Reihenfolge (sortOrder): die auf die letzte
  // gefolgte; fällt die letzte aus der Rotation, beginnt sie wieder vorne.
  const lastIdx = last
    ? rotation.findIndex((u) => u.slug === last.slug)
    : -1;
  const next =
    rotation.length > 0
      ? rotation[lastIdx >= 0 ? (lastIdx + 1) % rotation.length : 0]
      : null;
  const lastOfNext = next
    ? (summaries.find((s) => s.slug === next.slug) ?? null)
    : null;
  const nextColors = paletteClasses(next?.color);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* Letzte Session — Klick öffnet die Session-Detail-Seite. */}
      {last ? (
        <Link
          href={`/hypertrophy/${last.slug}/${last.date}?scope=all`}
          className="group flex flex-col gap-4 rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span
              aria-hidden
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-full font-heading text-sm font-semibold text-white",
                paletteClasses(last.color).bg,
              )}
            >
              {last.letter}
            </span>
            <span className="text-[10px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
              {last.cycle}. Session
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Letzte Gym-Session
            </p>
            <h3 className="font-heading text-2xl font-semibold tracking-tight">
              {last.label}
            </h3>
            <p className="text-sm text-muted-foreground">
              {formatRelativeShort(last.date, todayIso)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-border/40 pt-3 text-xs">
            <div>
              <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                Σ e1RM
              </p>
              <p className="mt-0.5 flex items-baseline gap-1.5 tabular-nums">
                <span className="font-heading text-lg font-semibold">
                  {last.totalE1.toString().replace(".", ",")}
                </span>
                <span className="text-muted-foreground">kg</span>
                {last.deltaToPrev !== null && <DeltaPill delta={last.deltaToPrev} />}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                Sätze
              </p>
              <p className="mt-0.5 font-heading text-lg font-semibold tabular-nums">
                {last.setCount}
              </p>
            </div>
          </div>
          <span
            aria-hidden
            className="mt-auto self-end text-lg text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          >
            →
          </span>
        </Link>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-3xl bg-card p-6 text-center ring-1 ring-black/5 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Noch keine Gym-Session geloggt.
          </p>
        </div>
      )}

      {/* Nächstes Workout laut Rotation. */}
      {next ? (
        <Link
          href={`/hypertrophy/${next.slug}`}
          className="group flex flex-col gap-4 rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span
              aria-hidden
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-full font-heading text-sm font-semibold text-white",
                nextColors.bg,
              )}
            >
              {next.letter}
            </span>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Als Nächstes dran
            </p>
            <h3 className="font-heading text-2xl font-semibold tracking-tight">
              {next.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              {lastOfNext
                ? `Zuletzt ${formatRelativeShort(lastOfNext.date, todayIso)} · Σe1RM ${lastOfNext.totalE1.toString().replace(".", ",")} kg`
                : "Noch nie geloggt."}
            </p>
          </div>
          <span className="mt-auto inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary">
            Workout öffnen
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-3xl bg-card p-6 text-center ring-1 ring-black/5 shadow-sm">
          <p className="text-sm text-muted-foreground">
            Keine Einheit in der Rotation.
          </p>
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

// "gestern" / "vor 3 Tagen" — deterministisch über todayIso vom Server.
function formatRelativeShort(iso: string, todayIso: string): string {
  const today = new Date(`${todayIso}T00:00:00`);
  const d = new Date(`${iso}T00:00:00`);
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "heute";
  if (diffDays === 1) return "gestern";
  if (diffDays < 7) return `vor ${diffDays} Tagen`;
  if (diffDays < 14) return "letzte Woche";
  if (diffDays < 30) return `vor ${Math.round(diffDays / 7)} Wochen`;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}
