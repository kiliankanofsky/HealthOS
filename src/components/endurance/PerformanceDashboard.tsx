import { Activity, ArrowRight, Footprints, HeartPulse, Moon, Target } from "lucide-react";
import Link from "next/link";

import type { GarminDailyMetrics, RunSession } from "@/lib/db/schema";

type Props = {
  metrics: GarminDailyMetrics | undefined;
  latestRun: RunSession | undefined;
};

export function PerformanceDashboard({ metrics, latestRun }: Props) {
  return (
    <div className="space-y-8">
      <DashboardSection title="Longevity">
        <div className="grid grid-cols-3 gap-3">
          <MetricTile
            icon={<HeartPulse className="size-4" />}
            label="Ruhepuls"
            value={metrics?.restingHeartRate ?? null}
            unit="bpm"
          />
          <MetricTile
            icon={<Activity className="size-4" />}
            label="HRV"
            value={metrics?.hrvLastNight ?? null}
            unit="ms"
            pill={metrics?.hrvStatus ?? undefined}
          />
          <MetricTile
            icon={<Moon className="size-4" />}
            label="Sleep"
            value={metrics?.sleepScore ?? null}
            unit="/100"
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RecommendationCard
            href="/endurance/longevity/recommendations"
            title="Empfohlenes Training"
            // Vorerst statische Empfehlung — eigentliche Empfehlungs-Logik
            // kommt mit der Trainingsplanung-Phase ([FILL: Empfehlungs-Logik]).
            preview="Easy Recovery Run · 5 km"
          />
          <HistoryCard
            href="/endurance/longevity/history"
            title="Historische Trainings"
            latestRun={latestRun}
          />
        </div>
      </DashboardSection>

      <DashboardSection title="Performance">
        <div className="grid grid-cols-2 gap-3">
          <RaceTile label="5 km" seconds={metrics?.racePrediction5k ?? null} />
          <RaceTile label="10 km" seconds={metrics?.racePrediction10k ?? null} />
          <RaceTile
            label="Halbmarathon"
            seconds={metrics?.racePredictionHalfMarathon ?? null}
          />
          <RaceTile
            label="Marathon"
            seconds={metrics?.racePredictionMarathon ?? null}
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <MetricTile
            icon={<Target className="size-4" />}
            label="Trainingszustand"
            // trainingStatus ist ein Feedback-Phrase-String von Garmin
            // (z.B. "PRODUCTIVE_3"). Wir zeigen ihn lesbar formatiert.
            value={formatStatus(metrics?.trainingStatus ?? null)}
            unit=""
            valueAsText
          />
          <MetricTile
            icon={<Activity className="size-4" />}
            label="VO₂ Max"
            value={metrics?.vo2MaxRunning ?? null}
            unit="ml/kg/min"
          />
          <MetricTile
            icon={<HeartPulse className="size-4" />}
            label="Laktatschwelle"
            value={metrics?.lactateThresholdHr ?? null}
            unit="bpm"
            sub={formatPace(metrics?.lactateThresholdPaceSecPerKm ?? null)}
          />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RecommendationCard
            href="/endurance/performance/recommendations"
            title="Empfohlenes Training"
            preview="Tempo-Run · 6 × 1 km"
          />
          <HistoryCard
            href="/endurance/performance/history"
            title="Historische Trainings"
            latestRun={latestRun}
          />
        </div>
      </DashboardSection>
    </div>
  );
}

function DashboardSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 font-heading text-lg font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function MetricTile({
  icon,
  label,
  value,
  unit,
  pill,
  sub,
  valueAsText,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string | null;
  unit: string;
  pill?: string;
  sub?: string | null;
  valueAsText?: boolean;
}) {
  const display =
    value === null
      ? "—"
      : valueAsText
        ? String(value)
        : typeof value === "number"
          ? formatNumber(value)
          : value;
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 font-heading text-xl font-semibold tabular-nums leading-tight">
        {display}
        {unit && value !== null && !valueAsText && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </p>
      {pill && (
        <span className="mt-1 inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
          {pill}
        </span>
      )}
      {sub && (
        <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

function RaceTile({
  label,
  seconds,
}: {
  label: string;
  seconds: number | null;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-heading text-lg font-semibold tabular-nums leading-tight">
        {seconds === null ? "—" : formatDuration(seconds)}
      </p>
    </div>
  );
}

function RecommendationCard({
  href,
  title,
  preview,
}: {
  href: string;
  title: string;
  preview: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
        <Target className="size-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs text-muted-foreground">{title}</span>
        <span className="block truncate text-sm font-medium">{preview}</span>
      </span>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function HistoryCard({
  href,
  title,
  latestRun,
}: {
  href: string;
  title: string;
  latestRun: RunSession | undefined;
}) {
  const preview = latestRun
    ? `${formatDe(latestRun.date)} · ${(latestRun.distanceMeters / 1000).toFixed(2).replace(".", ",")} km`
    : "Noch keine Läufe";
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className="inline-flex size-9 items-center justify-center rounded-full bg-[#FC5200]/15 text-[#FC5200]">
        <Footprints className="size-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs text-muted-foreground">{title}</span>
        <span className="block truncate text-sm font-medium">{preview}</span>
      </span>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

// ---- helpers ----

function formatNumber(n: number): string {
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: n < 10 && Math.floor(n) !== n ? 1 : 0,
  });
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(secPerKm: number | null): string | null {
  if (secPerKm === null) return null;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

function formatStatus(s: string | null): string | null {
  if (!s) return null;
  // Garmin liefert ALL_CAPS_WITH_UNDERSCORES — wir machen daraus lesbaren Text.
  return s
    .toLowerCase()
    .split("_")
    .filter((p) => !/^\d+$/.test(p))
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function formatDe(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}
