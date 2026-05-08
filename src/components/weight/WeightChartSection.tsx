"use client";

import { Layers, Plus, Spline, Tag } from "lucide-react";
import { useMemo, useState } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { type PhaseKind, type WeightEntry, type WeightPhase } from "@/lib/db/schema";
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
};

const KIND_LABELS: Record<PhaseKind, string> = {
  bulk: "Aufbau",
  cut: "Defizit",
  maintenance: "Erhaltung",
};

const KIND_PILL: Record<PhaseKind, string> = {
  bulk: "bg-violet-500/12 text-violet-700 ring-violet-500/25",
  cut: "bg-teal-500/12 text-teal-700 ring-teal-500/25",
  maintenance: "bg-muted text-muted-foreground ring-muted-foreground/20",
};

export function WeightChartSection({ entries, phases }: Props) {
  const [range, setRange] = useState<Range>("4w");
  const [showSmoothing, setShowSmoothing] = useState(true);
  const [showPhases, setShowPhases] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [editingPhase, setEditingPhase] = useState<WeightPhase | null>(null);
  const [phaseDialogOpen, setPhaseDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const data = useMemo<ChartPoint[]>(
    () =>
      entries.map((e) => ({
        date: e.date,
        weight: e.weightKg,
        cheatDay: e.cheatDay,
        alcohol: e.alcohol,
      })),
    [entries],
  );

  const entryByDate = useMemo(() => {
    const m = new Map<string, WeightEntry>();
    for (const e of entries) m.set(e.date, e);
    return m;
  }, [entries]);

  const filtered = useMemo(() => {
    const days = DAYS_BY_RANGE[range];
    if (days === null) return data;
    if (data.length === 0) return data;
    const lastDate = data[data.length - 1].date;
    const cutoff = new Date(lastDate);
    cutoff.setDate(cutoff.getDate() - (days - 1));
    return data.filter((point) => new Date(point.date) >= cutoff);
  }, [data, range]);

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
              aria-label="Cheat/Alkohol anzeigen"
              title="Cheat-Day / Alkohol"
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

      <WeightChart
        data={filtered}
        smoothed={smoothed}
        phases={visiblePhases}
        showTags={showTags}
        dense={range === "max"}
        onOpenDay={setSelectedDate}
      />

      {phases.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {phases.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setEditingPhase(p);
                setPhaseDialogOpen(true);
              }}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 transition-opacity hover:opacity-80",
                KIND_PILL[p.kind],
              )}
              title={`${KIND_LABELS[p.kind]} ab ${p.startDate}${p.endDate ? ` bis ${p.endDate}` : " (laufend)"}`}
            >
              {KIND_LABELS[p.kind]}
              <span className="ml-1 opacity-70">{formatShortDate(p.startDate)}</span>
            </button>
          ))}
        </div>
      )}

      <PhaseEditDialog
        open={phaseDialogOpen}
        phase={editingPhase}
        onClose={() => setPhaseDialogOpen(false)}
      />

      <WeightDayDetailDialog
        open={selectedDate !== null}
        date={selectedDate}
        entry={selectedDate ? entryByDate.get(selectedDate) ?? null : null}
        onClose={() => setSelectedDate(null)}
      />
    </div>
  );
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
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
