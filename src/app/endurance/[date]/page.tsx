import { ArrowLeft, Footprints } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/site/AppShell";
import { SplitsChart } from "@/components/endurance/SplitsChart";
import { getRunSessionsForDate } from "@/lib/db/queries";
import type { RunSession } from "@/lib/db/schema";
import { formatPace, formatSecondsAsHms } from "@/lib/endurance/plan";
import { lapsPaceSpread, runLapsToSplits } from "@/lib/endurance/plan-splits";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ date: string }>;

export default async function RunDetailPage({
  params,
}: {
  params: RouteParams;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const runs = await getRunSessionsForDate(date);
  if (runs.length === 0) notFound();

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl space-y-8 px-5 py-10 sm:px-8 lg:py-14">
        <Link
          href="/endurance"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Zur Endurance-Übersicht
        </Link>

        <header className="space-y-2">
          <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
            Endurance · {formatDate(date)}
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight lg:text-4xl">
            {runs.length === 1 ? "Lauf-Einheit" : `${runs.length} Läufe`}
          </h1>
        </header>

        <div className="space-y-6">
          {runs.map((r) => (
            <RunCard key={r.id} run={r} />
          ))}
        </div>
      </main>
    </AppShell>
  );
}

function RunCard({ run }: { run: RunSession }) {
  const km = run.distanceMeters / 1000;
  return (
    <section className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-8">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-[#FC5200]/15 text-[#FC5200]">
          <Footprints className="size-4" />
        </span>
        <div>
          <p className="text-xs text-muted-foreground">
            {formatActivityType(run.activityType)} · {formatTime(run.startTime)}
          </p>
          <p className="font-heading text-2xl font-semibold tabular-nums">
            {km.toFixed(2).replace(".", ",")} km
          </p>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Stat label="Zeit" value={formatSecondsAsHms(run.durationSeconds)} />
        <Stat
          label="Pace"
          value={formatPace(run.avgPaceSecPerKm)}
          unit="/km"
        />
        <Stat
          label="Höhenmeter"
          value={
            run.elevationGainMeters !== null
              ? Math.round(run.elevationGainMeters).toString()
              : "—"
          }
          unit="m"
        />
        <Stat
          label="Avg HR"
          value={run.avgHeartRate?.toString() ?? "—"}
          unit="bpm"
        />
        <Stat
          label="Max HR"
          value={run.maxHeartRate?.toString() ?? "—"}
          unit="bpm"
        />
        <Stat
          label="Kalorien"
          value={
            run.caloriesKcal !== null
              ? Math.round(run.caloriesKcal).toString()
              : "—"
          }
          unit="kcal"
        />
        <Stat
          label="Aerob TE"
          value={run.aerobicTrainingEffect?.toFixed(1) ?? "—"}
        />
        <Stat
          label="Anaerob TE"
          value={run.anaerobicTrainingEffect?.toFixed(1) ?? "—"}
        />
        <Stat
          label="Training Load"
          value={
            run.trainingLoad !== null ? Math.round(run.trainingLoad).toString() : "—"
          }
        />
      </dl>

      {run.lapsJson && run.lapsJson.length > 0 && (
        <div className="mt-6 border-t border-border/60 pt-5">
          <p className="mb-3 text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            Splits
          </p>
          <SplitsChart
            result={runLapsToSplits(run.lapsJson)}
            highlightFastest={lapsPaceSpread(run.lapsJson) >= 30}
          />
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-heading text-lg font-semibold tabular-nums">
        {value}
        {unit && value !== "—" && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </dd>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(isoDatetime: string): string {
  const t = isoDatetime.slice(11, 16);
  return t || "—";
}

function formatActivityType(t: string): string {
  const map: Record<string, string> = {
    running: "Lauf",
    treadmill_running: "Laufband",
    trail_running: "Trail-Lauf",
    indoor_running: "Indoor-Lauf",
    track_running: "Bahn-Lauf",
    street_running: "Straßenlauf",
  };
  return map[t] ?? t;
}

