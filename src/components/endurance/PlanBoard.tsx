"use client";

import { CalendarDays, Pencil, Route, Sparkles, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createBlankSession,
  loadSessionDetail,
  movePlanSession,
  type SessionDetail,
} from "@/app/endurance/recommendations/actions";
import {
  PlanCalendar,
  type CalendarSession,
} from "@/components/endurance/PlanCalendar";
import { EditSessionDialog } from "@/components/endurance/EditSessionDialog";
import type { TrainingPlanBlockSegment } from "@/lib/db/schema";
import { formatSecondsAsHms, type PaceZones } from "@/lib/endurance/plan";
import {
  describeBlock,
  formatDistance,
  formatSegmentPace,
  SESSION_STATUS_LABELS,
  sessionTone,
  sessionTypeLabel,
} from "@/lib/endurance/plan-format";

export type NextSessionBlock = {
  repetitions: number;
  description: string | null;
  segmentsJson: TrainingPlanBlockSegment[];
};

export type NextSessionData = CalendarSession & {
  blocks: NextSessionBlock[];
};

type Props = {
  planId: number;
  sessions: CalendarSession[];
  nextSession: NextSessionData | null;
  planStartDate: string;
  raceDate: string | null;
  paceZones: PaceZones | null;
  initialMonth: string;
  // Vom Server berechnet, damit SSR und Client identisch rendern (kein
  // `new Date()` im Client → keine Hydration-Mismatches).
  todayIso: string;
  // #10: KI-Tagesnotiz zur nächsten Session (aus Erholungsdaten). null = keine.
  nextSessionNote: string | null;
};

const CARD = "rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-7";

export function PlanBoard({
  planId,
  sessions,
  nextSession,
  planStartDate,
  raceDate,
  paceZones,
  initialMonth,
  todayIso,
  nextSessionNote,
}: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [movingId, setMovingId] = useState<number | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Klick auf eine Session: Dialog öffnen und Detail (inkl. Blocks) nachladen.
  // Läuft im Event-Handler, nicht im Effect — kein synchrones setState im Effect.
  function handleSelect(id: number) {
    setEditingId(id);
    setDetail(null);
    setLoadingDetail(true);
    loadSessionDetail(id).then((d) => {
      setDetail(d);
      setLoadingDetail(false);
    });
  }

  function handleClose() {
    setEditingId(null);
  }

  // "+" auf einem leeren Kalendertag: neue Session anlegen und direkt im
  // Edit-Dialog öffnen.
  function handleAddDay(dateIso: string) {
    setMoveError(null);
    startTransition(async () => {
      const r = await createBlankSession(planId, dateIso);
      if (!r.ok || r.sessionId == null) {
        setMoveError(r.error ?? "Anlegen fehlgeschlagen.");
        return;
      }
      router.refresh();
      handleSelect(r.sessionId);
    });
  }

  function handleMove(sessionId: number, newDate: string) {
    setMoveError(null);
    setMovingId(sessionId);
    startTransition(async () => {
      const r = await movePlanSession(sessionId, newDate);
      setMovingId(null);
      if (!r.ok) {
        setMoveError(r.error ?? "Verschieben fehlgeschlagen.");
        return;
      }
      router.refresh();
    });
  }

  function handleSaved() {
    setEditingId(null);
    setDetail(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <section className={`${CARD} lg:col-span-2`}>
          <PlanCalendar
            sessions={sessions}
            initialDate={initialMonth}
            planStartDate={planStartDate}
            raceDate={raceDate}
            todayIso={todayIso}
            onSelect={handleSelect}
            onMove={handleMove}
            onAddDay={handleAddDay}
            movingId={movingId}
          />
          {moveError && (
            <div className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-900">
              {moveError}
            </div>
          )}
        </section>

        <section className={CARD}>
          <NextSessionCard
            data={nextSession}
            paceZones={paceZones}
            todayIso={todayIso}
            note={nextSessionNote}
            onEdit={handleSelect}
          />
        </section>
      </div>

      <EditSessionDialog
        editingId={editingId}
        detail={detail}
        loading={loadingDetail}
        paceZones={paceZones}
        onClose={handleClose}
        onSaved={handleSaved}
      />
    </div>
  );
}

// ---- Nächste-Session-Card ----

function NextSessionCard({
  data,
  paceZones,
  todayIso,
  note,
  onEdit,
}: {
  data: NextSessionData | null;
  paceZones: PaceZones | null;
  todayIso: string;
  note: string | null;
  onEdit: (id: number) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        Nächste Session
      </p>

      {!data ? (
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <CalendarDays className="mb-3 size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Keine anstehende Session — alle erledigt oder Plan abgeschlossen.
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-1 flex-col">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${sessionTone(data.sessionType).soft}`}
            >
              {sessionTypeLabel(data.sessionType)}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeDate(data.date, todayIso)}
            </span>
          </div>

          <h3 className="mt-3 font-heading text-xl font-medium leading-snug">
            {data.title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground capitalize">
            {formatGermanDate(data.date)}
          </p>

          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            {data.targetDistanceMeters != null && (
              <span className="inline-flex items-center gap-1.5">
                <Route className="size-4 text-muted-foreground" />
                {formatDistance(data.targetDistanceMeters)}
              </span>
            )}
            {data.targetDurationSec != null && (
              <span className="inline-flex items-center gap-1.5">
                <Timer className="size-4 text-muted-foreground" />
                {formatSecondsAsHms(data.targetDurationSec)}
              </span>
            )}
          </div>

          {data.blocks.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-border/60 pt-4">
              {data.blocks.map((b, i) => {
                const pace = paceForBlock(b, paceZones);
                return (
                  <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-foreground">{describeBlock(b)}</span>
                    {pace && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {pace}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {note && (
            <div className="mt-4 flex gap-2 rounded-xl bg-primary/5 px-3 py-2.5 ring-1 ring-primary/10">
              <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <p className="text-sm leading-snug text-foreground/80">{note}</p>
            </div>
          )}

          <div className="mt-auto pt-5">
            <span className="text-xs text-muted-foreground">
              Status: {SESSION_STATUS_LABELS[data.status]}
            </span>
            <button
              type="button"
              onClick={() => onEdit(data.id)}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium transition-colors hover:border-foreground/40 hover:bg-muted"
            >
              <Pencil className="size-3.5" />
              Bearbeiten
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Pace eines Blocks: vom (ersten) Work-Segment, sonst vom ersten Segment.
function paceForBlock(
  block: NextSessionBlock,
  zones: PaceZones | null,
): string | null {
  const segs = block.segmentsJson ?? [];
  const work = segs.find((s) => s.kind === "work") ?? segs[0];
  return work ? formatSegmentPace(work, zones) : null;
}

// "Mo, 8. Juni"
function formatGermanDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

// "heute" / "morgen" / "in 4 Tagen" / "in 2 Wochen". todayIso wird vom Server
// gereicht (deterministisch — kein new Date() im Client → keine Hydration-Mismatches).
function formatRelativeDate(iso: string, todayIso: string): string {
  const today = new Date(`${todayIso}T00:00:00`);
  const target = new Date(`${iso}T00:00:00`);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return "heute";
  if (days === 1) return "morgen";
  if (days < 14) return `in ${days} Tagen`;
  return `in ${Math.round(days / 7)} Wochen`;
}
