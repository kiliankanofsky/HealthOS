import { ArrowRight, Footprints, Target } from "lucide-react";
import Link from "next/link";

import type { RunSession } from "@/lib/db/schema";

type Props = {
  latestRun: RunSession | undefined;
  // Wie viele Trainings im Preview kurz aufgelistet werden (rechte Card).
  historyCount?: number;
};

// Zwei große Cards unter dem Hauptgrid (Kalender + Metrics).
// Links: Empfohlene Trainings (Placeholder, da Empfehlungs-Logik noch nicht
// existiert). Rechts: Historische Trainings mit Preview-Liste der letzten
// Läufe.
export function TrainingsSection({ latestRun, historyCount = 3 }: Props) {
  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <TrainingsCard
        href="/endurance/recommendations"
        accent="emerald"
        icon={<Target className="size-5" />}
        title="Empfohlene Trainings"
        sub="Nächste Einheiten, abgestimmt auf deine Performance- und Recovery-Werte."
      >
        <div className="space-y-2">
          {/* [FILL: Empfehlungs-Logik] — solange wir noch keine echte Empfehlung
              berechnen, zeigen wir hier statische Vorschläge als Preview, damit
              die Card schon "lebt". */}
          <RecommendationPreview
            day="Heute"
            label="Easy Recovery Run"
            detail="5 km · Zone 1–2"
          />
          <RecommendationPreview
            day="Morgen"
            label="Tempo Intervalle"
            detail="6 × 1 km @ 4:00 /km"
          />
          <RecommendationPreview
            day="Sonntag"
            label="Long Run"
            detail="18 km · Zone 2"
          />
        </div>
      </TrainingsCard>

      <TrainingsCard
        href="/endurance/history"
        accent="orange"
        icon={<Footprints className="size-5" />}
        title="Historische Trainings"
        sub="Übersicht deiner letzten Läufe — Pace, Distanz, Herzfrequenz."
      >
        {latestRun ? (
          <HistoryPreview run={latestRun} placeholderCount={historyCount - 1} />
        ) : (
          <p className="text-sm text-muted-foreground">Noch keine Läufe.</p>
        )}
      </TrainingsCard>
    </section>
  );
}

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
    <Link
      href={href}
      className="group flex flex-col rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md lg:p-8"
    >
      <div className="flex items-start justify-between gap-3">
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
      </div>

      <div className="mt-5 flex-1">{children}</div>
    </Link>
  );
}

function RecommendationPreview({
  day,
  label,
  detail,
}: {
  day: string;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {day}
        </p>
        <p className="text-sm font-medium">{label}</p>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">{detail}</p>
    </div>
  );
}

function HistoryPreview({
  run,
  placeholderCount,
}: {
  run: RunSession;
  placeholderCount: number;
}) {
  const km = run.distanceMeters / 1000;
  const pace = formatPace(run.avgPaceSecPerKm);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Zuletzt · {formatDe(run.date)}
          </p>
          <p className="text-sm font-medium">
            {km.toFixed(2).replace(".", ",")} km
            {run.avgHeartRate ? ` · ${run.avgHeartRate} bpm` : ""}
          </p>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          Pace {pace} /km
        </p>
      </div>
      {/* Filler — eigentliche Liste kommt auf der History-Detail-Seite. */}
      {Array.from({ length: Math.max(0, placeholderCount) }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-border/40 bg-background/20 px-3 py-2 opacity-60"
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Weitere Läufe →
          </p>
          <p className="text-xs text-muted-foreground">In voller Liste sichtbar</p>
        </div>
      ))}
    </div>
  );
}

function formatDe(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

function formatPace(secPerKm: number | null): string {
  if (secPerKm === null) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
