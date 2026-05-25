"use client";

import { ChevronLeft, ChevronRight, Cookie, Footprints, Wine } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type RunMarker = {
  date: string; // YYYY-MM-DD
  activityType: string; // running / treadmill_running / trail_running / ...
};

export type CalendarTag = {
  date: string;
  cheatDay: boolean;
  alcohol: boolean;
};

type Props = {
  markers: RunMarker[];
  tags?: CalendarTag[];
};

const WEEKDAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

// Alle Run-Typen tragen denselben Strava-orangen Akzent.
const RUN_BG = "bg-[#FC5200]";

export function RunCalendar({ markers, tags = [] }: Props) {
  const [anchor, setAnchor] = useState<Date>(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });

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
    const m = new Map<string, RunMarker[]>();
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
          <NavButton
            onClick={() => setAnchor((d) => shiftMonths(d, -1))}
            aria-label="Vorheriger Monat"
          >
            <ChevronLeft className="size-4" />
          </NavButton>
          <span className="min-w-[8.5rem] text-center font-heading text-sm font-medium capitalize">
            {monthLabel}
          </span>
          <NavButton
            onClick={() => setAnchor((d) => shiftMonths(d, 1))}
            aria-label="Nächster Monat"
          >
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
            const primary = cellMarkers[0] ?? null;
            const extraCount = Math.max(0, cellMarkers.length - 1);

            return (
              <div
                key={i}
                className="relative flex flex-col items-center gap-1 py-1"
              >
                {primary ? (
                  <RunDayCell
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

function RunDayCell({
  marker,
  extraCount,
  isToday,
  faded,
}: {
  marker: RunMarker;
  extraCount: number;
  isToday: boolean;
  faded: boolean;
}) {
  return (
    <Link
      href={`/endurance/${marker.date}`}
      title={`Lauf · ${marker.date}`}
      className={cn(
        "relative inline-flex size-10 items-center justify-center rounded-full text-white shadow-sm ring-2 transition-transform hover:scale-110",
        RUN_BG,
        isToday ? "ring-foreground/40" : "ring-transparent",
        faded && "opacity-50",
      )}
    >
      <Footprints className="size-4" />
      {extraCount > 0 && (
        // Double-Day-Indikator: bei mehreren Läufen am gleichen Tag setzt
        // sich ein zweites, rotes Schuh-Icon in die rechte obere Ecke des
        // Kreises. Bei mehr als 2 Läufen zeigt ein "+N" daneben den Rest.
        <span
          aria-hidden
          title={
            extraCount === 1
              ? "Zweiter Lauf an diesem Tag"
              : `${extraCount + 1} Läufe an diesem Tag`
          }
          className="absolute -top-1 -right-1 inline-flex size-4 items-center justify-center rounded-full bg-red-600 text-white shadow-sm ring-2 ring-card"
        >
          <Footprints className="size-2.5" />
          {extraCount > 1 && (
            <span className="absolute -right-2 -bottom-1 text-[8px] font-semibold leading-none text-red-600">
              +{extraCount - 1}
            </span>
          )}
        </span>
      )}
    </Link>
  );
}

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

// ---- helpers (lokal — duplikatfrei zum Hypertrophy-Kalender, weil eigene Datei
// und kein gemeinsames util-File existiert; Refactor wäre größer als der Nutzen) ----

type Cell = { iso: string; day: number; month: number };

function buildWeekGrid(anchor: Date): Cell[] {
  const dayOfWeek = (anchor.getDay() + 6) % 7;
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
