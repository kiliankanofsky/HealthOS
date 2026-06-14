import { ArrowRight, CalendarDays, Route, Timer } from "lucide-react";
import Link from "next/link";

import type {
  TrainingPlanBlockSegment,
  TrainingPlanSession,
} from "@/lib/db/schema";
import { formatSecondsAsHms, type HrZones, type PaceZones } from "@/lib/endurance/plan";
import {
  describeBlock,
  formatDistance,
  formatSegmentHr,
  formatSegmentPace,
  paceZonesForSessionType,
  sessionTone,
  sessionTypeLabel,
} from "@/lib/endurance/plan-format";

// Read-only-Variante der "Nächste Session"-Card aus dem PlanBoard für die
// Startseite: gleiche Darstellung (Typ-Chip, Titel, Distanz/Dauer, Intervalle
// mit Pace), aber statt Edit-Dialog ein Link zum Plan.

export type NextSessionBlockData = {
  repetitions: number;
  description: string | null;
  segmentsJson: TrainingPlanBlockSegment[];
};

type Props = {
  session: TrainingPlanSession | null;
  blocks: NextSessionBlockData[];
  paceZones: PaceZones | null;
  hrZones: HrZones | null;
  todayIso: string;
};

export function NextSessionCard({ session, blocks, paceZones, hrZones, todayIso }: Props) {
  // Konservative Pace (langsamere Hälfte) bei Long/Easy/Recovery; HF voll.
  const pZones = session
    ? paceZonesForSessionType(paceZones, session.sessionType)
    : null;
  return (
    <div className="flex h-full flex-col">
      <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        Nächste Session
      </p>

      {!session ? (
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <CalendarDays className="mb-3 size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Keine anstehende Session — lege unter Endurance einen Plan an.
          </p>
          <Link
            href="/endurance/recommendations"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Zum Plan
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : (
        <div className="mt-3 flex flex-1 flex-col">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${sessionTone(session.sessionType).soft}`}
            >
              {sessionTypeLabel(session.sessionType)}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeDate(session.date, todayIso)}
            </span>
          </div>

          <h3 className="mt-3 font-heading text-xl font-medium leading-snug">
            {session.title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground capitalize">
            {formatGermanDate(session.date)}
          </p>

          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            {session.targetDistanceMeters != null && (
              <span className="inline-flex items-center gap-1.5">
                <Route className="size-4 text-muted-foreground" />
                {formatDistance(session.targetDistanceMeters)}
              </span>
            )}
            {session.targetDurationSec != null && (
              <span className="inline-flex items-center gap-1.5">
                <Timer className="size-4 text-muted-foreground" />
                {formatSecondsAsHms(session.targetDurationSec)}
              </span>
            )}
          </div>

          {blocks.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-border/60 pt-4">
              {blocks.map((b, i) => {
                const pace = paceForBlock(b, pZones);
                const hr = hrForBlock(b, hrZones);
                return (
                  <li
                    key={i}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="text-foreground">{describeBlock(b)}</span>
                    {(pace || hr) && (
                      <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {pace && <span className="block">{pace}</span>}
                        {hr && <span className="block">{hr}</span>}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-auto pt-5">
            <Link
              href="/endurance/recommendations"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium transition-colors hover:border-foreground/40 hover:bg-muted"
            >
              Zum Plan
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// Pace eines Blocks: vom (ersten) Work-Segment, sonst vom ersten Segment.
function paceForBlock(
  block: NextSessionBlockData,
  zones: PaceZones | null,
): string | null {
  const segs = block.segmentsJson ?? [];
  const work = segs.find((s) => s.kind === "work") ?? segs[0];
  return work ? formatSegmentPace(work, zones) : null;
}

// HF-Band eines Blocks (analog) — aus den Live-Trainingszonen.
function hrForBlock(
  block: NextSessionBlockData,
  zones: HrZones | null,
): string | null {
  const segs = block.segmentsJson ?? [];
  const work = segs.find((s) => s.kind === "work") ?? segs[0];
  return work ? formatSegmentHr(work, zones) : null;
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

// "heute" / "morgen" / "in 4 Tagen" / "in 2 Wochen" (analog PlanBoard).
function formatRelativeDate(iso: string, todayIso: string): string {
  const today = new Date(`${todayIso}T00:00:00`);
  const target = new Date(`${iso}T00:00:00`);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return "heute";
  if (days === 1) return "morgen";
  if (days < 14) return `in ${days} Tagen`;
  return `in ${Math.round(days / 7)} Wochen`;
}
