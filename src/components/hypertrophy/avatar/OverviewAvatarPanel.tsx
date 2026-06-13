"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  AVATAR_REGION_TO_DB,
  MUSCLE_LABELS,
  projectMuscleMapToAvatar,
  VOLUME_PRIMARY_THRESHOLD,
  VOLUME_SECONDARY_THRESHOLD,
  type AvatarRegion,
  type DbMuscleSlug,
  type HighlightLevel,
} from "@/lib/hypertrophy/muscles";
import { cn } from "@/lib/utils";

import { MuscleAvatar } from "./MuscleAvatar";

export function OverviewAvatarPanel({
  volumeEntries,
}: {
  volumeEntries: [DbMuscleSlug, number][];
}) {
  const [hovered, setHovered] = useState<AvatarRegion | null>(null);
  const [mobileView, setMobileView] = useState<"anterior" | "posterior">(
    "anterior",
  );
  const [expanded, setExpanded] = useState(false);

  const volumeBySlug = useMemo(
    () => new Map<DbMuscleSlug, number>(volumeEntries),
    [volumeEntries],
  );

  const highlights = useMemo(() => {
    const dbMap = new Map<DbMuscleSlug, HighlightLevel>();
    for (const [slug, sets] of volumeBySlug.entries()) {
      if (sets >= VOLUME_PRIMARY_THRESHOLD) dbMap.set(slug, "primary");
      else if (sets >= VOLUME_SECONDARY_THRESHOLD) dbMap.set(slug, "secondary");
    }
    return projectMuscleMapToAvatar(dbMap);
  }, [volumeBySlug]);

  const hoveredLabel = useMemo(() => {
    if (!hovered) return null;
    const dbSlugs = AVATAR_REGION_TO_DB[hovered] ?? [];
    const parts = dbSlugs
      .map((s) => {
        const sets = volumeBySlug.get(s) ?? 0;
        return `${MUSCLE_LABELS[s]} ${formatSets(sets)}`;
      })
      .filter((v, i, a) => a.indexOf(v) === i);
    return parts.join(" · ") || hovered;
  }, [hovered, volumeBySlug]);

  const hasVolume = volumeEntries.length > 0;

  return (
    <section
      className={cn(
        "relative h-full overflow-hidden rounded-3xl",
        "bg-white/55 dark:bg-white/[0.04]",
        "backdrop-blur-xl backdrop-saturate-150",
        "ring-1 ring-black/5",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]",
        "p-5 sm:p-6 lg:p-8",
        "flex flex-col",
      )}
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
            Anatomie · Volumen
          </p>
          <h2 className="font-heading text-base font-semibold tracking-tight">
            Sätze pro Muskelgruppe — letzte 7 Tage
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
            {hoveredLabel ?? "Hover/Tap auf eine Muskelgruppe"}
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
              highlights={highlights}
              activeRegion={hovered}
              onRegionEnter={setHovered}
              onRegionLeave={() => setHovered(null)}
              onRegionClick={(r) => setHovered((cur) => (cur === r ? null : r))}
              tone="neutral"
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
              highlights={highlights}
              activeRegion={hovered}
              onRegionEnter={setHovered}
              onRegionLeave={() => setHovered(null)}
              onRegionClick={(r) => setHovered((cur) => (cur === r ? null : r))}
              tone="neutral"
            />
          </div>
          <p className="mt-1.5 text-center text-[10px] font-medium tracking-[0.18em] text-muted-foreground/70 uppercase">
            Hinten
          </p>
        </div>
      </div>

      {/*
        Aggregation unten an die Card gepinnt (mt-auto): eingeklappt schneidet
        die Card direkt unter dem "Aggregation"-Header ab — die Höhe entspricht
        damit (via Grid-Stretch) dem Kalender daneben. Klick auf den Header
        klappt die Balkenliste darunter auf, erst dann wächst die Card.
      */}
      <div className="mt-auto flex flex-col pt-5">
        {hasVolume ? (
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="flex w-full items-center justify-between gap-2 rounded-lg py-1 text-left hover:opacity-80"
            >
              <span className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
                Aggregation
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                {expanded ? "Einklappen" : `${volumeEntries.length} Muskelgruppen`}
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform duration-200",
                    expanded && "rotate-180",
                  )}
                />
              </span>
            </button>

            {/*
              Höhen-Animation 0fr↔1fr: klappt sauber von 0 auf "auto" auf, ohne
              feste max-height. Eingeklappt ist die Liste vollständig verborgen.
            */}
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out",
                expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <ul className="space-y-2 pt-3">
                  {volumeEntries.map(([slug, sets]) => (
                    <li key={slug} className="flex items-center gap-3">
                      <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">
                        {MUSCLE_LABELS[slug]}
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            sets >= VOLUME_PRIMARY_THRESHOLD
                              ? "bg-slate-700 dark:bg-slate-300"
                              : sets >= VOLUME_SECONDARY_THRESHOLD
                                ? "bg-slate-400"
                                : "bg-slate-300/70 dark:bg-slate-600",
                          )}
                          style={{ width: `${Math.min(100, (sets / 20) * 100)}%` }}
                        />
                      </span>
                      <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums">
                        {formatSets(sets)} S
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-center text-[10px] tracking-wide text-muted-foreground/60">
                  Gewichtete Sätze (primär 1,0 / sekundär 0,5) · dunkel ≥{" "}
                  {VOLUME_PRIMARY_THRESHOLD}, hell ≥ {VOLUME_SECONDARY_THRESHOLD}{" "}
                  · Balken relativ zu 20 Sätzen/Woche
                </p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-center text-xs text-muted-foreground/70">
            Keine Sätze in den letzten 7 Tagen geloggt.
          </p>
        )}
      </div>
    </section>
  );
}

function formatSets(sets: number): string {
  return Number.isInteger(sets)
    ? String(sets)
    : sets.toFixed(1).replace(".", ",");
}
