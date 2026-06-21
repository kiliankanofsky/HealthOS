"use client";

import { ChevronLeft, ChevronRight, Cookie, Dumbbell, Wine } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { paletteClasses } from "@/lib/hypertrophy/workouts";
import { cn } from "@/lib/utils";

export type CalendarMarker = {
  date: string; // YYYY-MM-DD
  // Palette-Key + Anzeigename der Trainingseinheit (aus workout_templates).
  color: string | null;
  name: string;
  templateSlug: string;
};

export type CalendarTag = {
  date: string;
  cheatDay: boolean;
  alcohol: boolean;
};

type Props = {
  markers: CalendarMarker[];
  tags?: CalendarTag[];
};

const WEEKDAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function Calendar({ markers, tags = [] }: Props) {
  // Anchor-Datum: Buttons shiften Monate, Trackpad-Swipe shiftet Wochen.
  // Das Grid ist an der Anker-Woche ausgerichtet (nicht am Monatsanfang),
  // damit jeder Wochen-Schritt sichtbar eine Zeile verschiebt.
  const [anchor, setAnchor] = useState<Date>(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });

  // Scroll-/Swipe-Navigation: vertikales Wheel/Trackpad shiftet den Anchor
  // um eine Woche. Debounce über akkumulierten deltaY, damit ein Trackpad-
  // Schwung nicht 5 Wochen weiterspringt.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const accumDeltaRef = useRef(0);
  const lastShiftRef = useRef(0);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      e.preventDefault();
      accumDeltaRef.current += e.deltaY;

      const now = Date.now();
      if (Math.abs(accumDeltaRef.current) < 40) return;
      if (now - lastShiftRef.current < 150) return;

      const direction = accumDeltaRef.current > 0 ? 1 : -1;
      accumDeltaRef.current = 0;
      lastShiftRef.current = now;
      setAnchor((d) => shiftDays(d, direction * 7));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const markersByDate = useMemo(() => {
    const m = new Map<string, CalendarMarker[]>();
    for (const x of markers) {
      const list = m.get(x.date) ?? [];
      list.push(x);
      m.set(x.date, list);
    }
    return m;
  }, [markers]);

  const tagsByDate = useMemo(() => {
    const m = new Map<string, CalendarTag>();
    for (const t of tags) m.set(t.date, t);
    return m;
  }, [tags]);

  const cells = useMemo(() => buildWeekGrid(anchor), [anchor]);

  // Label zeigt den Monat, der die Anker-Woche dominiert (Anchor-Monat selbst).
  const monthLabel = anchor.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
  const anchorMonth = anchor.getMonth();
  const todayIso = toISODate(new Date());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Kalender
        </p>
        <div className="flex items-center gap-1">
          <NavButton onClick={() => setAnchor((d) => shiftMonths(d, -1))} aria-label="Vorheriger Monat">
            <ChevronLeft className="size-4" />
          </NavButton>
          <span className="min-w-[8.5rem] text-center font-heading text-sm font-medium capitalize">
            {monthLabel}
          </span>
          <NavButton onClick={() => setAnchor((d) => shiftMonths(d, 1))} aria-label="Nächster Monat">
            <ChevronRight className="size-4" />
          </NavButton>
        </div>
      </div>

      <div
        ref={gridRef}
        className="select-none"
        title="Trackpad-/Mausrad-Swipe vertikal: Woche wechseln"
      >
        <div className="grid grid-cols-7 gap-1 pb-2">
          {WEEKDAYS_DE.map((d) => (
            <div
              key={d}
              className="text-center text-[11px] font-medium tracking-wider text-muted-foreground/80 uppercase"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1.5">
          {cells.map((cell, i) => {
            const isCurrentMonth = cell.month === anchorMonth;
            const cellMarkers = markersByDate.get(cell.iso) ?? [];
            const cellTag = tagsByDate.get(cell.iso);
            const isToday = cell.iso === todayIso;
            // Pro Tag wird der erste Marker dominant angezeigt — wenn ein
            // Doppel-Workout vorkommt, dann als kleines Hinweis-Dot rechts oben.
            const primary = cellMarkers[0] ?? null;
            const extraCount = Math.max(0, cellMarkers.length - 1);

            return (
              <div
                key={i}
                className="relative flex flex-col items-center gap-1 py-1"
              >
                {primary ? (
                  <WorkoutDayCell
                    marker={primary}
                    extraCount={extraCount}
                    isToday={isToday}
                    faded={!isCurrentMonth}
                  />
                ) : (
                  <EmptyDayCell
                    day={cell.day}
                    isToday={isToday}
                    faded={!isCurrentMonth}
                  />
                )}
                {(cellTag?.cheatDay || cellTag?.alcohol) && (
                  <span className="flex items-center gap-0.5 text-rose-600/80">
                    {cellTag.cheatDay && (
                      <span title="Cheat Day" aria-label="Cheat Day">
                        <Cookie className="size-2.5" />
                      </span>
                    )}
                    {cellTag.alcohol && (
                      <span title="Alkohol" aria-label="Alkohol">
                        <Wine className="size-2.5" />
                      </span>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Tag mit Workout: ausgefüllter Kreis in der Workout-Farbe + Hantel-Icon innen.
// Strava-Anlehnung: Icon trägt die Bedeutung, Datum-Nummer entfällt für gefüllte Tage.
function WorkoutDayCell({
  marker,
  extraCount,
  isToday,
  faded,
}: {
  marker: CalendarMarker;
  extraCount: number;
  isToday: boolean;
  faded: boolean;
}) {
  const colors = paletteClasses(marker.color);
  return (
    <Link
      href={`/hypertrophy/${marker.templateSlug}/${marker.date}?scope=all`}
      title={`${marker.name} · ${marker.date}`}
      className={cn(
        "relative inline-flex size-10 items-center justify-center rounded-full text-white shadow-sm ring-2 transition-transform hover:scale-110",
        colors.bg,
        isToday ? "ring-foreground/40" : "ring-transparent",
        faded && "opacity-50",
      )}
    >
      <Dumbbell className="size-4" />
      {extraCount > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 inline-flex size-3.5 items-center justify-center rounded-full bg-foreground text-[9px] font-semibold tabular-nums text-background ring-2 ring-card"
        >
          +{extraCount}
        </span>
      )}
    </Link>
  );
}

// Tag ohne Workout: nur die Datums-Nummer in einem dezenten outline Kreis.
function EmptyDayCell({
  day,
  isToday,
  faded,
}: {
  day: number;
  isToday: boolean;
  faded: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-full text-sm tabular-nums",
        isToday
          ? "bg-foreground text-background font-semibold"
          : "text-muted-foreground/80 ring-1 ring-inset ring-border/70",
        faded && "opacity-40",
      )}
    >
      {day}
    </span>
  );
}

function NavButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

// ---- helpers ----

type Cell = { iso: string; day: number; month: number };

function buildWeekGrid(anchor: Date): Cell[] {
  // Apple/DE: Wochenbeginn Montag. Grid startet eine Woche vor dem Anker,
  // damit Vorwoche, Anker-Woche und vier Folgewochen sichtbar sind.
  const dayOfWeek = (anchor.getDay() + 6) % 7; // 0=Mo … 6=So
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - dayOfWeek - 7);

  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({
      iso: toISODate(d),
      day: d.getDate(),
      month: d.getMonth(),
    });
  }
  return cells;
}

function shiftMonths(d: Date, delta: number): Date {
  const next = new Date(d);
  next.setMonth(next.getMonth() + delta);
  return next;
}

function shiftDays(d: Date, delta: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + delta);
  return next;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
