"use client";

import { ChevronLeft, ChevronRight, Dumbbell, Footprints } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

// Meta-Kalender der Startseite: vereint vergangene Läufe (orange, wie
// RunCalendar), Gym-Sessions (Template-Farbe, wie Hypertrophy-Kalender)
// und geplante zukünftige Plan-Sessions (hellgrau). Klick führt direkt
// zur jeweiligen Detail-Seite (Goldstandard-Links der Module).

export type MetaMarker = {
  date: string; // YYYY-MM-DD
  kind: "run" | "gym" | "planned";
  href: string;
  title: string;
  // Nur gym: Tailwind-bg der Workout-Farbe (WORKOUT_COLORS[kind].bg).
  colorClass?: string;
};

type Props = {
  markers: MetaMarker[];
  // Vom Server (deterministisch) — markiert "heute" ohne new Date() im Client.
  todayIso: string;
};

const WEEKDAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
// Strava-Orange, identisch zum RunCalendar.
const RUN_BG = "bg-[#FC5200]";

export function MetaCalendar({ markers, todayIso }: Props) {
  const [anchor, setAnchor] = useState<Date>(() => parseIso(todayIso));

  const markersByDate = useMemo(() => {
    const m = new Map<string, MetaMarker[]>();
    for (const x of markers) {
      const list = m.get(x.date) ?? [];
      list.push(x);
      m.set(x.date, list);
    }
    // Reihenfolge pro Tag: echte Workouts vor geplanten.
    const order = { run: 0, gym: 1, planned: 2 } as const;
    for (const list of m.values()) {
      list.sort((a, b) => order[a.kind] - order[b.kind]);
    }
    return m;
  }, [markers]);

  const cells = useMemo(() => buildMonthGrid(anchor), [anchor]);
  const anchorMonth = anchor.getMonth();
  const monthLabel = anchor.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });

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

      <div>
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
          {cells.map((cell) => {
            const cellMarkers = markersByDate.get(cell.iso) ?? [];
            const faded = cell.month !== anchorMonth;
            const isToday = cell.iso === todayIso;
            return (
              <div
                key={cell.iso}
                className="relative flex flex-col items-center gap-1 py-1"
              >
                {cellMarkers.length === 0 ? (
                  <EmptyDayCell day={cell.day} isToday={isToday} faded={faded} />
                ) : (
                  <MarkerGroup
                    markers={cellMarkers}
                    isToday={isToday}
                    faded={faded}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <LegendDot className={RUN_BG} label="Lauf" />
        <LegendDot className="bg-indigo-500" label="Gym" />
        <LegendDot className="bg-muted ring-1 ring-inset ring-border" label="Geplant" />
      </div>
    </div>
  );
}

// Alle Marker eines Tages. Ein Marker → großer Kreis; mehrere → kleinere,
// leicht überlappende Kreise (jeder bleibt klickbar).
function MarkerGroup({
  markers,
  isToday,
  faded,
}: {
  markers: MetaMarker[];
  isToday: boolean;
  faded: boolean;
}) {
  const compact = markers.length > 1;
  return (
    <span className={cn("flex items-center", compact && "-space-x-1.5")}>
      {markers.slice(0, 3).map((m, i) => (
        <MarkerCircle
          key={`${m.kind}-${i}`}
          marker={m}
          compact={compact}
          isToday={isToday && i === 0}
          faded={faded}
        />
      ))}
    </span>
  );
}

function MarkerCircle({
  marker,
  compact,
  isToday,
  faded,
}: {
  marker: MetaMarker;
  compact: boolean;
  isToday: boolean;
  faded: boolean;
}) {
  const Icon = marker.kind === "gym" ? Dumbbell : Footprints;
  return (
    <Link
      href={marker.href}
      title={marker.title}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full shadow-sm ring-2 transition-transform hover:z-10 hover:scale-110",
        compact ? "size-7" : "size-10",
        marker.kind === "run" && `${RUN_BG} text-white`,
        marker.kind === "gym" && `${marker.colorClass ?? "bg-indigo-500"} text-white`,
        // Geplante Sessions: hellgrau unterlegt, dezent.
        marker.kind === "planned" &&
          "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
        isToday ? "ring-foreground/40" : "ring-transparent",
        marker.kind === "planned" && "ring-border",
        faded && "opacity-50",
      )}
    >
      <Icon className={compact ? "size-3" : "size-4"} />
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

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2.5 rounded-full", className)} />
      {label}
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

// ---- Datums-Helfer (lokal, analog PlanCalendar) ----

type Cell = { iso: string; day: number; month: number };

function buildMonthGrid(anchor: Date): Cell[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const dow = (first.getDay() + 6) % 7; // 0=Mo … 6=So
  const start = new Date(first);
  start.setDate(first.getDate() - dow);

  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ iso: toISODate(d), day: d.getDate(), month: d.getMonth() });
  }
  return cells;
}

function shiftMonths(d: Date, delta: number): Date {
  const next = new Date(d);
  next.setMonth(next.getMonth() + delta);
  return next;
}

function parseIso(iso: string): Date {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
