import { ArrowRight, Footprints, Target } from "lucide-react";
import Link from "next/link";

import type { RunSession, TrainingPlanSessionType } from "@/lib/db/schema";
import { formatPace } from "@/lib/endurance/plan";
import { formatDistance, sessionTypeLabel } from "@/lib/endurance/plan-format";

// Schlanke Sicht auf die nächsten Plan-Sessions (nur was die Vorschau braucht).
export type UpcomingSession = {
  id: number;
  date: string;
  sessionType: TrainingPlanSessionType;
  title: string;
  targetDistanceMeters: number | null;
  targetDurationSec: number | null;
  primaryZone: number | null;
};

type Props = {
  // Nächste (max 3) geplante Sessions aus dem aktiven Plan.
  upcoming: UpcomingSession[];
  // Letzte (max 3) absolvierte Läufe.
  recentRuns: RunSession[];
  hasPlan: boolean;
  // Vom Server, damit Relativ-Datum deterministisch ist (keine Hydration-Diffs).
  todayIso: string;
};

// Zwei große Cards unter dem Hauptgrid (Kalender + Metrics):
// links die nächsten geplanten Trainings (verlinkt auf die jeweilige Session
// im Plan), rechts die letzten Läufe (verlinkt auf die Lauf-Detailseite).
export function TrainingsSection({
  upcoming,
  recentRuns,
  hasPlan,
  todayIso,
}: Props) {
  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <TrainingsCard
        href="/endurance/recommendations"
        accent="emerald"
        icon={<Target className="size-5" />}
        title="Empfohlene Trainings"
        sub="Deine nächsten Einheiten aus dem Goal-Race-Plan."
      >
        {upcoming.length > 0 ? (
          <div className="space-y-2">
            {upcoming.map((s) => (
              <RecommendationRow key={s.id} session={s} todayIso={todayIso} />
            ))}
          </div>
        ) : (
          <EmptyHint
            href={
              hasPlan
                ? "/endurance/recommendations"
                : "/endurance/recommendations/setup"
            }
            text={
              hasPlan
                ? "Keine anstehenden Sessions — alle erledigt."
                : "Noch kein Plan angelegt."
            }
            cta={hasPlan ? "Zum Plan" : "Plan anlegen"}
          />
        )}
      </TrainingsCard>

      <TrainingsCard
        href="/endurance/history"
        accent="orange"
        icon={<Footprints className="size-5" />}
        title="Historische Trainings"
        sub="Deine letzten Läufe — Pace, Distanz, Herzfrequenz."
      >
        {recentRuns.length > 0 ? (
          <div className="space-y-2">
            {recentRuns.map((r, i) => (
              <HistoryRow key={r.id} run={r} isLatest={i === 0} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Noch keine Läufe.</p>
        )}
      </TrainingsCard>
    </section>
  );
}

// Card-Hülle: KEIN umschließender Link mehr (sonst wären die Zeilen-Links
// verschachtelte <a> → ungültig). Stattdessen ist der Header ein Link zur
// Sektion und jede Zeile darunter ein eigener Link.
function TrainingsCard({
  href,
  accent,
  icon,
  title,
  sub,
  children,
}: {
  href: string;
  accent: "emerald" | "orange";
  icon: React.ReactNode;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  const accentClasses =
    accent === "emerald"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : "bg-[#FC5200]/15 text-[#FC5200]";
  return (
    <div className="flex flex-col rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-8">
      <Link href={href} className="group flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex size-10 items-center justify-center rounded-full ${accentClasses}`}
          >
            {icon}
          </span>
          <div>
            <h3 className="font-heading text-xl font-semibold">{title}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>
          </div>
        </div>
        <ArrowRight className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>

      <div className="mt-5 flex-1">{children}</div>
    </div>
  );
}

function RecommendationRow({
  session,
  todayIso,
}: {
  session: UpcomingSession;
  todayIso: string;
}) {
  const zone = session.primaryZone;
  const distance =
    session.targetDistanceMeters != null
      ? formatDistance(session.targetDistanceMeters)
      : session.targetDurationSec != null
        ? `${Math.round(session.targetDurationSec / 60)} min`
        : null;
  const detail = [distance, zone != null ? `Zone ${zone}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href={`/endurance/recommendations?session=${session.id}`}
      className="flex items-center justify-between gap-4 rounded-lg border border-border/40 bg-background/40 px-3 py-2 transition-colors hover:border-border hover:bg-background/70"
    >
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {formatRelativeDay(session.date, todayIso)} ·{" "}
          {sessionTypeLabel(session.sessionType)}
        </p>
        <p className="truncate text-sm font-medium">{session.title}</p>
      </div>
      {detail && (
        <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {detail}
        </p>
      )}
    </Link>
  );
}

function HistoryRow({ run, isLatest }: { run: RunSession; isLatest: boolean }) {
  const km = run.distanceMeters / 1000;
  return (
    <Link
      href={`/endurance/${run.date}`}
      className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/40 px-3 py-2 transition-colors hover:border-border hover:bg-background/70"
    >
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {isLatest ? "Zuletzt" : formatDe(run.date)}
          {isLatest ? ` · ${formatDe(run.date)}` : ""}
        </p>
        <p className="text-sm font-medium">
          {km.toFixed(2).replace(".", ",")} km
          {run.avgHeartRate ? ` · ${run.avgHeartRate} bpm` : ""}
        </p>
      </div>
      <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
        Pace {formatPace(run.avgPaceSecPerKm)} /km
      </p>
    </Link>
  );
}

function EmptyHint({
  href,
  text,
  cta,
}: {
  href: string;
  text: string;
  cta: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        {cta}
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

// "Heute" / "Morgen" / "Mo" / "14. Jun" — deterministisch über todayIso.
function formatRelativeDay(iso: string, todayIso: string): string {
  const today = new Date(`${todayIso}T00:00:00`);
  const target = new Date(`${iso}T00:00:00`);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return "Heute";
  if (days === 1) return "Morgen";
  if (days < 7)
    return target.toLocaleDateString("de-DE", { weekday: "short" });
  return formatDe(iso);
}

function formatDe(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}
