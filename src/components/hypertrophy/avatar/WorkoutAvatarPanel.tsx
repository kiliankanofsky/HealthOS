"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  AVATAR_REGION_TO_DB,
  type AvatarRegion,
  type DbMuscleSlug,
  type HighlightLevel,
  projectMuscleMapToAvatar,
} from "@/lib/hypertrophy/muscles";
import { cn } from "@/lib/utils";

import { MuscleAvatar } from "./MuscleAvatar";
import {
  MuscleExerciseList,
  type MuscleExerciseEntry,
} from "./MuscleExerciseList";

type Props = {
  templateSlug: string;
  /** DB-Slug → Highlight-Level (als Tuple-Array für RSC-Serialisierung). */
  highlightsEntries: [DbMuscleSlug, HighlightLevel][];
  /** DB-Slug → Übungen, die diese Muskelgruppe trainieren. */
  exercisesByMuscleEntries: [DbMuscleSlug, MuscleExerciseEntry[]][];
};

/**
 * Anatomie-Avatar für die Workout-Detail-Seite.
 * - Desktop (md+): Front + Back nebeneinander, Hover öffnet Popover, Klick macht's sticky.
 * - Mobile: Toggle Front/Back, Tap auf Muskel öffnet Bottom-Sheet.
 */
export function WorkoutAvatarPanel({
  templateSlug,
  highlightsEntries,
  exercisesByMuscleEntries,
}: Props) {
  const [active, setActive] = useState<AvatarRegion | null>(null);
  const [sticky, setSticky] = useState(false);
  const [mobileView, setMobileView] = useState<"anterior" | "posterior">(
    "anterior",
  );

  const highlights = useMemo(
    () => new Map(highlightsEntries),
    [highlightsEntries],
  );
  const exercisesByMuscle = useMemo(
    () => new Map(exercisesByMuscleEntries),
    [exercisesByMuscleEntries],
  );

  const avatarHighlights = useMemo(
    () => projectMuscleMapToAvatar(highlights),
    [highlights],
  );

  // Übungs-Aggregation über alle DB-Slugs, die in der aktiven Region landen.
  const activeEntries = useMemo<MuscleExerciseEntry[]>(() => {
    if (!active) return [];
    const dbSlugs = AVATAR_REGION_TO_DB[active] ?? [];
    const seen = new Set<string>();
    const out: MuscleExerciseEntry[] = [];
    for (const slug of dbSlugs) {
      const list = exercisesByMuscle.get(slug) ?? [];
      for (const e of list) {
        if (seen.has(e.exerciseSlug)) continue;
        seen.add(e.exerciseSlug);
        out.push(e);
      }
    }
    return out;
  }, [active, exercisesByMuscle]);

  // Esc schließt das sticky Popover/Sheet.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActive(null);
        setSticky(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const handleEnter = (r: AvatarRegion) => {
    if (sticky) return;
    setActive(r);
  };
  const handleLeave = () => {
    if (sticky) return;
    setActive(null);
  };
  const handleClick = (r: AvatarRegion) => {
    setActive(r);
    setSticky(true);
  };
  const handleClose = () => {
    setActive(null);
    setSticky(false);
  };

  return (
    <section className="relative">
      {/* Liquid-Glass Container. */}
      <div
        className={cn(
          "relative overflow-hidden rounded-3xl",
          "bg-white/55 dark:bg-white/[0.04]",
          "backdrop-blur-xl backdrop-saturate-150",
          "ring-1 ring-black/5",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]",
          "p-6 lg:p-8",
        )}
      >
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
              Anatomie
            </p>
            <h2 className="font-heading text-base font-semibold tracking-tight">
              Trainierte Muskeln
            </h2>
          </div>
          <div className="md:hidden">
            <SegmentedControl
              size="sm"
              options={[
                { value: "anterior", label: "Vorne" },
                { value: "posterior", label: "Hinten" },
              ]}
              value={mobileView}
              onChange={setMobileView}
            />
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Anterior */}
          <div
            className={cn(
              "relative mx-auto w-full max-w-[260px]",
              "md:block",
              mobileView === "anterior" ? "block" : "hidden",
            )}
          >
            <div className="aspect-[100/213]">
              <MuscleAvatar
                view="anterior"
                highlights={avatarHighlights}
                activeRegion={active}
                onRegionEnter={handleEnter}
                onRegionLeave={handleLeave}
                onRegionClick={handleClick}
              />
            </div>
            <p className="mt-2 text-center text-[10px] font-medium tracking-[0.18em] text-muted-foreground/70 uppercase">
              Vorne
            </p>
          </div>

          {/* Posterior */}
          <div
            className={cn(
              "relative mx-auto w-full max-w-[260px]",
              "md:block",
              mobileView === "posterior" ? "block" : "hidden",
            )}
          >
            <div className="aspect-[100/220]">
              <MuscleAvatar
                view="posterior"
                highlights={avatarHighlights}
                activeRegion={active}
                onRegionEnter={handleEnter}
                onRegionLeave={handleLeave}
                onRegionClick={handleClick}
              />
            </div>
            <p className="mt-2 text-center text-[10px] font-medium tracking-[0.18em] text-muted-foreground/70 uppercase">
              Hinten
            </p>
          </div>
        </div>

        {/* Desktop-Popover — über dem Avatar absolut positioniert. */}
        {active && (
          <div
            role="dialog"
            aria-modal={sticky ? "true" : undefined}
            className={cn(
              "hidden md:block",
              "absolute right-4 top-4 z-20 w-72",
              "rounded-2xl border border-white/40 bg-white/85 p-4 shadow-xl",
              "backdrop-blur-xl backdrop-saturate-150",
              "dark:border-white/10 dark:bg-zinc-900/85",
              "animate-in fade-in slide-in-from-right-2 duration-150",
            )}
          >
            <button
              type="button"
              onClick={handleClose}
              aria-label="Schließen"
              className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
            <MuscleExerciseList
              region={active}
              templateSlug={templateSlug}
              entries={activeEntries}
              onSelect={handleClose}
            />
          </div>
        )}
      </div>

      {/* Mobile-Bottom-Sheet — fullscreen overlay mit slide-up sheet. */}
      {active && (
        <div
          className="md:hidden fixed inset-0 z-50 flex flex-col justify-end"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="Schließen"
            onClick={handleClose}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
          />
          <div
            className={cn(
              "relative max-h-[80vh] overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 shadow-2xl",
              "dark:bg-zinc-900",
              "animate-in slide-in-from-bottom duration-200",
            )}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
            <button
              type="button"
              onClick={handleClose}
              aria-label="Schließen"
              className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
            <MuscleExerciseList
              region={active}
              templateSlug={templateSlug}
              entries={activeEntries}
              onSelect={handleClose}
            />
          </div>
        </div>
      )}
    </section>
  );
}
