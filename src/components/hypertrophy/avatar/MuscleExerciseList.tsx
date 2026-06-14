import Link from "next/link";

import {
  AVATAR_REGION_TO_DB,
  MUSCLE_LABELS,
  type AvatarRegion,
  type HighlightLevel,
} from "@/lib/hypertrophy/muscles";
import { cn } from "@/lib/utils";

export type MuscleExerciseEntry = {
  exerciseSlug: string;
  exerciseName: string;
  /** Niveau dieser Übung für die gehoverte Region (primary > secondary). */
  level: HighlightLevel;
  /** Position innerhalb des Workouts — bestimmt Reihenfolge (Workout-Detail). */
  position?: number;
  unilateral?: boolean;
  /** Overview: Template-Slug für den Link (überschreibt den Listen-Prop). */
  templateSlug?: string;
  /** Overview: gewichtete Sätze dieser Übung für die Muskelgruppe (7 Tage). */
  sets?: number;
};

type Props = {
  region: AvatarRegion;
  templateSlug: string;
  entries: MuscleExerciseEntry[];
  onSelect?: () => void;
};

/**
 * Inhalts-Komponente für Hover-Popover (Desktop) und Bottom-Sheet (Mobile).
 * Enthält den Muskelnamen, eine Liste der Übungen — Primary zuerst, dann
 * Secondary, jeweils in Workout-Reihenfolge.
 */
export function MuscleExerciseList({
  region,
  templateSlug,
  entries,
  onSelect,
}: Props) {
  // Reihenfolge: wenn Satz-Daten vorhanden (Overview), nach Sätzen absteigend,
  // sonst nach Workout-Position (Workout-Detail).
  const order = (a: MuscleExerciseEntry, b: MuscleExerciseEntry) =>
    a.sets != null || b.sets != null
      ? (b.sets ?? 0) - (a.sets ?? 0)
      : (a.position ?? 0) - (b.position ?? 0);
  const primaries = entries.filter((e) => e.level === "primary").sort(order);
  const secondaries = entries.filter((e) => e.level === "secondary").sort(order);

  const dbSlugs = AVATAR_REGION_TO_DB[region] ?? [];
  const headline = dbSlugs
    .map((s) => MUSCLE_LABELS[s])
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(" / ");

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-col gap-0.5">
        <p className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
          Muskelgruppe
        </p>
        <h3 className="font-heading text-base font-semibold tracking-tight">
          {headline || region}
        </h3>
      </header>

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Keine Übung in diesem Workout zielt auf diese Muskelgruppe.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {primaries.length > 0 && (
            <Section
              label="Primär"
              entries={primaries}
              templateSlug={templateSlug}
              onSelect={onSelect}
              variant="primary"
            />
          )}
          {secondaries.length > 0 && (
            <Section
              label="Sekundär"
              entries={secondaries}
              templateSlug={templateSlug}
              onSelect={onSelect}
              variant="secondary"
            />
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  entries,
  templateSlug,
  onSelect,
  variant,
}: {
  label: string;
  entries: MuscleExerciseEntry[];
  templateSlug: string;
  onSelect?: () => void;
  variant: "primary" | "secondary";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p
        className={cn(
          "text-[10px] font-medium tracking-[0.18em] uppercase",
          variant === "primary" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <ul className="flex flex-col gap-1">
        {entries.map((e) => (
          <li key={e.exerciseSlug}>
            <Link
              href={`/hypertrophy/${e.templateSlug ?? templateSlug}/exercise/${e.exerciseSlug}`}
              onClick={onSelect}
              className={cn(
                "group flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                variant === "primary"
                  ? "bg-foreground/[0.04] hover:bg-foreground/[0.08] font-medium"
                  : "hover:bg-foreground/[0.04] text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="truncate">{e.exerciseName}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                {e.sets != null && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatSets(e.sets)} S
                  </span>
                )}
                <span
                  aria-hidden
                  className="text-xs text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                >
                  →
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatSets(sets: number): string {
  return Number.isInteger(sets) ? String(sets) : sets.toFixed(1).replace(".", ",");
}
