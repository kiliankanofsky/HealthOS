"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  TrainingPlanSessionStatus,
  TrainingPlanSessionType,
} from "@/lib/db/schema";
import {
  formatDistance,
  formatDurationShort,
  sessionTone,
  sessionTypeLabel,
} from "@/lib/endurance/plan-format";
import { cn } from "@/lib/utils";

export type CalendarSession = {
  id: number;
  date: string; // YYYY-MM-DD
  dayOrder: number;
  sessionType: TrainingPlanSessionType;
  title: string;
  status: TrainingPlanSessionStatus;
  targetDistanceMeters: number | null;
  targetDurationSec: number | null;
  primaryZone: number | null;
};

type Props = {
  sessions: CalendarSession[];
  // Monat, der initial angezeigt wird (z.B. Datum der nächsten Session).
  initialDate: string;
  // Plan-Zeitraum — Tage außerhalb sind kein gültiges Drop-Ziel.
  planStartDate: string;
  raceDate: string | null;
  // Vom Server (deterministisch) — markiert "heute" ohne new Date() im Client.
  todayIso: string;
  onSelect: (sessionId: number) => void;
  onMove: (sessionId: number, newDate: string) => void;
  // Neue Session an einem (leeren) Tag im Plan-Zeitraum anlegen.
  onAddDay: (dateIso: string) => void;
  // Während eine Verschiebung an den Server geht: Chip ausgrauen.
  movingId: number | null;
};

const WEEKDAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function PlanCalendar({
  sessions,
  initialDate,
  planStartDate,
  raceDate,
  todayIso,
  onSelect,
  onMove,
  onAddDay,
  movingId,
}: Props) {
  const [anchor, setAnchor] = useState<Date>(() => parseIso(initialDate));
  const [activeId, setActiveId] = useState<number | null>(null);

  // PointerSensor mit 6px-Schwelle: ein Klick (ohne Bewegung) löst KEIN Drag
  // aus, sondern öffnet den Edit-Dialog. Erst ab 6px Ziehen startet der Drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const sessionsByDate = useMemo(() => {
    const m = new Map<string, CalendarSession[]>();
    for (const s of sessions) {
      const list = m.get(s.date) ?? [];
      list.push(s);
      m.set(s.date, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.dayOrder - b.dayOrder);
    return m;
  }, [sessions]);

  const cells = useMemo(() => buildMonthGrid(anchor), [anchor]);
  const anchorMonth = anchor.getMonth();
  const monthLabel = anchor.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });

  const activeSession = activeId
    ? (sessions.find((s) => s.id === activeId) ?? null)
    : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(Number(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overIso = e.over?.id;
    if (typeof overIso !== "string") return;
    const sessionId = Number(e.active.id);
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || session.date === overIso) return;
    onMove(sessionId, overIso);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const inPlan =
                cell.iso >= planStartDate &&
                (raceDate == null || cell.iso <= raceDate);
              const cellSessions = sessionsByDate.get(cell.iso) ?? [];
              return (
                <DayCell
                  key={cell.iso}
                  iso={cell.iso}
                  day={cell.day}
                  faded={cell.month !== anchorMonth}
                  isToday={cell.iso === todayIso}
                  inPlan={inPlan}
                  draggingActive={activeId !== null}
                  showAdd={inPlan && cellSessions.length === 0 && activeId === null}
                  onAdd={() => onAddDay(cell.iso)}
                >
                  {cellSessions.map((s) => (
                    <DraggableChip
                      key={s.id}
                      session={s}
                      onSelect={onSelect}
                      muted={movingId === s.id}
                    />
                  ))}
                </DayCell>
              );
            })}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Ziehe eine Session auf einen anderen Tag, um sie zu verschieben · Klick
          öffnet die Details.
        </p>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeSession ? (
          <ChipVisual session={activeSession} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ---- Tageszelle (Drop-Ziel) ----

function DayCell({
  iso,
  day,
  faded,
  isToday,
  inPlan,
  draggingActive,
  showAdd,
  onAdd,
  children,
}: {
  iso: string;
  day: number;
  faded: boolean;
  isToday: boolean;
  inPlan: boolean;
  draggingActive: boolean;
  showAdd: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  // Nur Tage im Plan-Zeitraum sind gültige Drop-Ziele.
  const { setNodeRef, isOver } = useDroppable({ id: iso, disabled: !inPlan });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative min-h-[5.25rem] rounded-xl p-1 ring-1 transition-colors",
        inPlan ? "bg-muted/30 ring-black/5" : "bg-transparent ring-transparent",
        // Drop-Highlight nur, solange wirklich gezogen wird.
        draggingActive && inPlan && "ring-dashed ring-border",
        isOver && inPlan && "bg-primary/10 ring-2 ring-primary",
        faded && "opacity-45",
      )}
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <span
          className={cn(
            "text-[11px] tabular-nums",
            isToday
              ? "inline-flex size-5 items-center justify-center rounded-full bg-foreground font-semibold text-background"
              : "text-muted-foreground/80",
          )}
        >
          {day}
        </span>
      </div>
      <div className="space-y-1">{children}</div>
      {showAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label="Session hinzufügen"
          title="Session hinzufügen"
          className="absolute inset-x-1 bottom-1 inline-flex items-center justify-center rounded-md py-1 text-muted-foreground/0 transition-colors hover:bg-foreground/5 hover:text-muted-foreground group-hover:text-muted-foreground/60"
        >
          <Plus className="size-4" />
        </button>
      )}
    </div>
  );
}

// ---- Session-Chip (Draggable) ----

function DraggableChip({
  session,
  onSelect,
  muted,
}: {
  session: CalendarSession;
  onSelect: (id: number) => void;
  muted: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: session.id,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onSelect(session.id)}
      {...listeners}
      {...attributes}
      className={cn(
        "block w-full touch-none text-left",
        "cursor-grab active:cursor-grabbing",
        (isDragging || muted) && "opacity-40",
      )}
    >
      <ChipVisual session={session} />
    </button>
  );
}

// Rein visuell — von Chip UND DragOverlay genutzt, damit das gezogene Element
// identisch aussieht.
function ChipVisual({
  session,
  dragging,
}: {
  session: CalendarSession;
  dragging?: boolean;
}) {
  const tone = sessionTone(session.sessionType);
  const measure =
    session.targetDistanceMeters != null
      ? formatDistance(session.targetDistanceMeters)
      : formatDurationShort(session.targetDurationSec);
  const done = session.status === "completed";

  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium leading-tight shadow-sm",
        tone.chip,
        done && "opacity-70",
        dragging && "scale-105 shadow-lg ring-2 ring-white/60",
      )}
    >
      {done && <Check className="size-2.5 shrink-0" />}
      <span className="truncate">
        {sessionTypeLabel(session.sessionType)}
        {measure !== "—" ? ` · ${measure}` : ""}
      </span>
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

// ---- Datums-Helfer (lokal, analog RunCalendar) ----

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
