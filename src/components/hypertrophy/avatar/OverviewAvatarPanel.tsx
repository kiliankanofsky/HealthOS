"use client";

import { useMemo, useState } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  AVATAR_REGION_TO_DB,
  MUSCLE_LABELS,
  type AvatarRegion,
} from "@/lib/hypertrophy/muscles";
import { cn } from "@/lib/utils";

import { MuscleAvatar } from "./MuscleAvatar";

/**
 * Anatomie-Avatar für die Hypertrophy-Übersichtsseite.
 *
 * Initial-Zustand: alle Muskeln neutral (Initial-Variante "a" aus 0.5 Exec).
 * Hover highlightet die Region und zeigt den Muskelnamen — keine Übungs-Liste,
 * kein Click-Drilldown. Volumen-Aggregation pro Muskelgruppe folgt später.
 */
export function OverviewAvatarPanel() {
  const [hovered, setHovered] = useState<AvatarRegion | null>(null);
  const [mobileView, setMobileView] = useState<"anterior" | "posterior">(
    "anterior",
  );

  // Initial-Zustand "a": kein Default-Highlighting. Hover wird über
  // `activeRegion` an MuscleAvatar weitergegeben — der färbt entsprechend.
  const emptyHighlights = useMemo(() => new Map(), []);

  const hoveredLabel = useMemo(() => {
    if (!hovered) return null;
    const dbSlugs = AVATAR_REGION_TO_DB[hovered] ?? [];
    return (
      dbSlugs
        .map((s) => MUSCLE_LABELS[s])
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(" / ") || hovered
    );
  }, [hovered]);

  return (
    <section
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
            Muskelübersicht
          </h2>
          <p
            className={cn(
              "mt-0.5 text-xs transition-colors duration-150",
              hoveredLabel
                ? "font-medium text-foreground"
                : "text-muted-foreground/70",
            )}
            aria-live="polite"
          >
            {hoveredLabel ?? "Hover über eine Muskelgruppe"}
          </p>
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div
          className={cn(
            "relative mx-auto w-full max-w-[220px]",
            "md:block",
            mobileView === "anterior" ? "block" : "hidden",
          )}
        >
          <div className="aspect-[100/213]">
            <MuscleAvatar
              view="anterior"
              highlights={emptyHighlights}
              activeRegion={hovered}
              onRegionEnter={setHovered}
              onRegionLeave={() => setHovered(null)}
              tone="subtle"
            />
          </div>
          <p className="mt-1.5 text-center text-[10px] font-medium tracking-[0.18em] text-muted-foreground/70 uppercase">
            Vorne
          </p>
        </div>
        <div
          className={cn(
            "relative mx-auto w-full max-w-[220px]",
            "md:block",
            mobileView === "posterior" ? "block" : "hidden",
          )}
        >
          <div className="aspect-[100/220]">
            <MuscleAvatar
              view="posterior"
              highlights={emptyHighlights}
              activeRegion={hovered}
              onRegionEnter={setHovered}
              onRegionLeave={() => setHovered(null)}
              tone="subtle"
            />
          </div>
          <p className="mt-1.5 text-center text-[10px] font-medium tracking-[0.18em] text-muted-foreground/70 uppercase">
            Hinten
          </p>
        </div>
      </div>

      <p className="mt-4 text-center text-[10px] tracking-wide text-muted-foreground/60">
        Volumen-Aggregation pro Muskelgruppe folgt
      </p>
    </section>
  );
}
