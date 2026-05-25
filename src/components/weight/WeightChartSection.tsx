"use client";

import { ChevronLeft, ChevronRight, Layers, Plus, Spline, Tag } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  type DailyTag,
  type WeightEntry,
  type WeightPhase,
} from "@/lib/db/schema";
import { loessSmooth, recommendedSpan } from "@/lib/utils/loess";
import { cn } from "@/lib/utils";

import { PhaseEditDialog } from "./PhaseEditDialog";
import { WeightChart, type ChartPoint } from "./WeightChart";
import { WeightDayDetailDialog } from "./WeightDayDetailDialog";

type Range = "1w" | "4w" | "8w" | "3m" | "max";

const OPTIONS: { value: Range; label: string }[] = [
  { value: "1w", label: "Woche" },
  { value: "4w", label: "4 Wochen" },
  { value: "8w", label: "8 Wochen" },
  { value: "3m", label: "3 Monate" },
  { value: "max", label: "Max" },
];

const DAYS_BY_RANGE: Record<Range, number | null> = {
  "1w": 7,
  "4w": 28,
  "8w": 56,
  "3m": 90,
  max: null,
};

type Props = {
  entries: WeightEntry[];
  phases: WeightPhase[];
  // Tags (cheatDay/alcohol/cheatMeal) leben seit Migration 0012 in einer
  // eigenen Tabelle. Section bekommt sie als separates Prop und mergt sie
  // pro Datum in den Chart-Point.
  tags: DailyTag[];
};

export function WeightChartSection({ entries, phases, tags }: Props) {
  const [range, setRange] = useState<Range>("4w");
  // windowOffset in Tagen — verschiebt das sichtbare Fenster in die Vergangenheit.
  // 0 = aktuellster Zeitraum. Wird beim Range-Wechsel auf 0 resettet.
  const [windowOffset, setWindowOffset] = useState(0);
  const [showSmoothing, setShowSmoothing] = useState(true);
  const [showPhases, setShowPhases] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [editingPhase, setEditingPhase] = useState<WeightPhase | null>(null);
  const [phaseDialogOpen, setPhaseDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const tagsByDate = useMemo(() => {
    const m = new Map<string, DailyTag>();
    for (const t of tags) m.set(t.date, t);
    return m;
  }, [tags]);

  const data = useMemo<ChartPoint[]>(
    () =>
      entries.map((e) => {
        const t = tagsByDate.get(e.date);
        return {
          date: e.date,
          weight: e.weightKg,
          cheatDay: t?.cheatDay ?? false,
          alcohol: t?.alcohol ?? false,
          cheatMeal: t?.cheatMeal ?? false,
        };
      }),
    [entries, tagsByDate],
  );

  const entryByDate = useMemo(() => {
    const m = new Map<string, WeightEntry>();
    for (const e of entries) m.set(e.date, e);
    return m;
  }, [entries]);

  // Range-Wechsel → Offset auf 0 zurück, damit man immer am aktuellen Ende startet.
  useEffect(() => {
    setWindowOffset(0);
  }, [range]);

  const days = DAYS_BY_RANGE[range];
  // Maximaler Offset: so weit, dass der älteste Eintrag im Fenster liegt.
  const maxOffset = useMemo(() => {
    if (days === null || data.length === 0) return 0;
    const lastDate = new Date(data[data.length - 1].date);
    const firstDate = new Date(data[0].date);
    const totalDays =
      Math.floor((lastDate.getTime() - firstDate.getTime()) / 86_400_000) + 1;
    return Math.max(0, totalDays - days);
  }, [days, data]);

  const filtered = useMemo(() => {
    if (days === null) return data;
    if (data.length === 0) return data;
    const lastDate = data[data.length - 1].date;
    const end = new Date(lastDate);
    end.setDate(end.getDate() - windowOffset);
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    return data.filter((point) => {
      const d = new Date(point.date);
      return d >= start && d <= end;
    });
  }, [data, days, windowOffset]);

  const smoothed = useMemo(() => {
    if (!showSmoothing || filtered.length < 3) return null;
    const span = recommendedSpan(filtered.length);
    return loessSmooth(
      filtered.map((p) => ({ date: p.date, weight: p.weight })),
      span,
    );
  }, [filtered, showSmoothing]);

  const visiblePhases = useMemo(() => {
    if (!showPhases || filtered.length === 0) return [];
    const firstDate = filtered[0].date;
    const lastDate = filtered[filtered.length - 1].date;
    return phases.filter((p) => {
      const phaseEnd = p.endDate ?? lastDate;
      // Überlappung [firstDate, lastDate] ∩ [p.start, phaseEnd]
      return phaseEnd >= firstDate && p.startDate <= lastDate;
    });
  }, [phases, filtered, showPhases]);

  // Swipe-Navigation: horizontaler Wheel/Trackpad-Swipe shiftet das Fenster
  // um eine volle Range-Breite. Debounced, damit ein Schwung nicht 3 Fenster
  // weiterspringt.
  const swipeRef = useRef<HTMLDivElement | null>(null);
  const accumDeltaRef = useRef(0);
  const lastShiftRef = useRef(0);

  const shiftWindow = (direction: 1 | -1) => {
    if (days === null) return; // Max-Range hat kein Fenster.
    setWindowOffset((prev) => {
      const next = prev + direction * days;
      if (next < 0) return 0;
      if (next > maxOffset) return maxOffset;
      return next;
    });
  };

  useEffect(() => {
    const el = swipeRef.current;
    if (!el || days === null) return;
    const onWheel = (e: WheelEvent) => {
      // Nur horizontal-dominierte Gesten als Swipe interpretieren.
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      accumDeltaRef.current += e.deltaX;
      const now = Date.now();
      if (Math.abs(accumDeltaRef.current) < 50) return;
      if (now - lastShiftRef.current < 250) return;
      // Reversed scroll: positiver deltaX (Swipe nach links) zeigt jetzt
      // neuere Daten (Fenster Richtung Gegenwart); negatives deltaX (Swipe
      // nach rechts) blättert in die Vergangenheit.
      const direction: 1 | -1 = accumDeltaRef.current > 0 ? -1 : 1;
      accumDeltaRef.current = 0;
      lastShiftRef.current = now;
      shiftWindow(direction);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [days, maxOffset]);

  // Label für den sichtbaren Zeitraum (für Tap-Buttons + visuelles Feedback).
  const windowLabel = useMemo(() => {
    if (filtered.length === 0) return "";
    const first = filtered[0].date;
    const last = filtered[filtered.length - 1].date;
    if (first === last) return formatShort(first);
    return `${formatShort(first)} – ${formatShort(last)}`;
  }, [filtered]);

  const canShiftOlder = days !== null && windowOffset < maxOffset;
  const canShiftNewer = days !== null && windowOffset > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Verlauf
        </p>
        <div className="flex items-center gap-2">
          <SegmentedControl options={OPTIONS} value={range} onChange={setRange} size="sm" />
          <div className="flex items-center gap-1">
            <ToggleButton
              active={showSmoothing}
              onClick={() => setShowSmoothing((v) => !v)}
              aria-label="Glättung anzeigen"
              title="Glättung (LOESS)"
            >
              <Spline className="size-3.5" />
            </ToggleButton>
            <ToggleButton
              active={showPhases}
              onClick={() => setShowPhases((v) => !v)}
              aria-label="Phasen anzeigen"
              title="Phasen (Aufbau / Defizit)"
            >
              <Layers className="size-3.5" />
            </ToggleButton>
            <ToggleButton
              active={showTags}
              onClick={() => setShowTags((v) => !v)}
              aria-label="Tag anzeigen"
              title="Tag"
            >
              <Tag className="size-3.5" />
            </ToggleButton>
            <button
              type="button"
              onClick={() => {
                setEditingPhase(null);
                setPhaseDialogOpen(true);
              }}
              aria-label="Phase hinzufügen"
              title="Phase hinzufügen"
              className="ml-1 inline-flex size-7 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div ref={swipeRef} className="space-y-2" title="Horizontal swipen: vor/zurück im Zeitfenster">
        <WeightChart
          data={filtered}
          smoothed={smoothed}
          phases={visiblePhases}
          showTags={showTags}
          dense={range === "max"}
          onOpenDay={setSelectedDate}
          onOpenPhase={(phase) => {
            setEditingPhase(phase);
            setPhaseDialogOpen(true);
          }}
        />
        {days !== null && (
          <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
            <NavButton
              onClick={() => shiftWindow(1)}
              disabled={!canShiftOlder}
              aria-label="Vorheriger Zeitraum"
            >
              <ChevronLeft className="size-3.5" />
            </NavButton>
            <span className="tabular-nums">{windowLabel}</span>
            <NavButton
              onClick={() => shiftWindow(-1)}
              disabled={!canShiftNewer}
              aria-label="Nächster Zeitraum"
            >
              <ChevronRight className="size-3.5" />
            </NavButton>
          </div>
        )}
      </div>

      <PhaseEditDialog
        open={phaseDialogOpen}
        phase={editingPhase}
        onClose={() => setPhaseDialogOpen(false)}
      />

      <WeightDayDetailDialog
        open={selectedDate !== null}
        date={selectedDate}
        entry={selectedDate ? entryByDate.get(selectedDate) ?? null : null}
        tag={selectedDate ? tagsByDate.get(selectedDate) ?? null : null}
        onClose={() => setSelectedDate(null)}
      />
    </div>
  );
}

function formatShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

function NavButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}

function ToggleButton({
  active,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full transition-colors",
        active
          ? "bg-foreground/10 text-foreground ring-1 ring-foreground/15"
          : "text-muted-foreground/70 hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
