"use client";

import { ChevronLeft, ChevronRight, Spline, Tag } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import type { DailyActivity, NutritionEntry, WeightEntry } from "@/lib/db/schema";
import { loessSmooth, recommendedSpan } from "@/lib/utils/loess";
import { cn } from "@/lib/utils";

import { NutritionChart, type NutritionChartPoint } from "./NutritionChart";
import { NutritionDayDetailDialog } from "./NutritionDayDetailDialog";

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
  entries: NutritionEntry[];
  weightEntries: WeightEntry[];
  activity: DailyActivity[];
};

export function NutritionChartSection({ entries, weightEntries, activity }: Props) {
  const [range, setRange] = useState<Range>("4w");
  const [windowOffset, setWindowOffset] = useState(0);
  const [showSmoothing, setShowSmoothing] = useState(true);
  const [showTags, setShowTags] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Lookups
  const weightByDate = useMemo(() => {
    const m = new Map<string, WeightEntry>();
    for (const w of weightEntries) m.set(w.date, w);
    return m;
  }, [weightEntries]);

  const activityByDate = useMemo(() => {
    const m = new Map<string, DailyActivity>();
    for (const a of activity) m.set(a.date, a);
    return m;
  }, [activity]);

  const nutritionByDate = useMemo(() => {
    const m = new Map<string, NutritionEntry>();
    for (const e of entries) m.set(e.date, e);
    return m;
  }, [entries]);

  // Chart-Daten: Kalorien-Wert je nach Tag-Logik anpassen.
  // - Cheat Meal + kcalTarget: Ziel statt fddb-Wert (Meal getauscht aber im Ziel).
  // - Cheat Day: Wert auf null (Linie wird unterbrochen), Punkt wird im Chart
  //   gesondert oberhalb der Linie als Indikator gerendert.
  // Wir reichern jeden Datums-Schlüssel mit Tags an, auch wenn kein Nutrition-
  // Eintrag existiert — Cheat-Day soll auch dann sichtbar sein.
  const data = useMemo<NutritionChartPoint[]>(() => {
    const allDates = new Set<string>();
    for (const e of entries) allDates.add(e.date);
    for (const w of weightEntries) {
      if (w.cheatDay || w.cheatMeal || w.alcohol) allDates.add(w.date);
    }
    const sorted = Array.from(allDates).sort();
    return sorted.map((date) => {
      const e = nutritionByDate.get(date);
      const w = weightByDate.get(date);
      const cheatDay = w?.cheatDay ?? false;
      const cheatMeal = w?.cheatMeal ?? false;
      const alcohol = w?.alcohol ?? false;
      const rawKcal = e?.caloriesKcal ?? null;
      const target = w?.kcalTarget ?? null;
      let value: number | null;
      if (cheatDay) {
        value = null;
      } else if (cheatMeal && target != null) {
        value = target;
      } else {
        value = rawKcal;
      }
      return {
        date,
        caloriesKcal: value,
        rawCaloriesKcal: rawKcal,
        kcalTarget: target,
        cheatDay,
        cheatMeal,
        alcohol,
      };
    });
  }, [entries, weightEntries, nutritionByDate, weightByDate]);

  useEffect(() => {
    setWindowOffset(0);
  }, [range]);

  const days = DAYS_BY_RANGE[range];
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
    if (!showSmoothing) return null;
    const valid = filtered.filter(
      (p): p is NutritionChartPoint & { caloriesKcal: number } =>
        p.caloriesKcal !== null,
    );
    if (valid.length < 3) return null;
    const span = recommendedSpan(valid.length);
    return loessSmooth(
      valid.map((p) => ({ date: p.date, weight: p.caloriesKcal })),
      span,
    );
  }, [filtered, showSmoothing]);

  // Swipe-Navigation (gleich wie Weight).
  const swipeRef = useRef<HTMLDivElement | null>(null);
  const accumDeltaRef = useRef(0);
  const lastShiftRef = useRef(0);

  const shiftWindow = (direction: 1 | -1) => {
    if (days === null) return;
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
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      accumDeltaRef.current += e.deltaX;
      const now = Date.now();
      if (Math.abs(accumDeltaRef.current) < 50) return;
      if (now - lastShiftRef.current < 250) return;
      const direction: 1 | -1 = accumDeltaRef.current > 0 ? -1 : 1;
      accumDeltaRef.current = 0;
      lastShiftRef.current = now;
      shiftWindow(direction);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [days, maxOffset]);

  const windowLabel = useMemo(() => {
    if (filtered.length === 0) return "";
    const first = filtered[0].date;
    const last = filtered[filtered.length - 1].date;
    if (first === last) return formatShort(first);
    return `${formatShort(first)} – ${formatShort(last)}`;
  }, [filtered]);

  const canShiftOlder = days !== null && windowOffset < maxOffset;
  const canShiftNewer = days !== null && windowOffset > 0;

  const selectedActivity = selectedDate
    ? activityByDate.get(selectedDate) ?? null
    : null;
  const selectedNutrition = selectedDate
    ? nutritionByDate.get(selectedDate) ?? null
    : null;
  const selectedWeight = selectedDate
    ? weightByDate.get(selectedDate) ?? null
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Kalorien-Verlauf
        </p>
        <div className="flex items-center gap-2">
          <SegmentedControl
            options={OPTIONS}
            value={range}
            onChange={setRange}
            size="sm"
          />
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
              active={showTags}
              onClick={() => setShowTags((v) => !v)}
              aria-label="Tag anzeigen"
              title="Tag"
            >
              <Tag className="size-3.5" />
            </ToggleButton>
          </div>
        </div>
      </div>

      <div
        ref={swipeRef}
        className="space-y-2"
        title="Horizontal swipen: vor/zurück im Zeitfenster"
      >
        <NutritionChart
          data={filtered}
          smoothed={smoothed}
          showTags={showTags}
          dense={range === "max"}
          onOpenDay={setSelectedDate}
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

      <NutritionDayDetailDialog
        open={selectedDate !== null}
        date={selectedDate}
        nutrition={selectedNutrition}
        weight={selectedWeight}
        garminTotalKcal={selectedActivity?.totalKcal ?? null}
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
