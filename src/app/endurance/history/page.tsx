import { ArrowLeft, Footprints } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/site/AppShell";
import { getAllRunSessions } from "@/lib/db/queries";
import type { RunSession } from "@/lib/db/schema";
import { formatPace, formatSecondsAsHms } from "@/lib/endurance/plan";

export const dynamic = "force-dynamic";

export default async function EnduranceHistoryPage() {
  // getAllRunSessions liefert bereits nach startTime DESC (neueste zuerst).
  const runs = await getAllRunSessions();
  const totalKm = runs.reduce((s, r) => s + r.distanceMeters, 0) / 1000;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:px-8 sm:py-10 lg:py-14">
        <Link
          href="/endurance"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Zur Endurance-Übersicht
        </Link>

        <header className="space-y-2">
          <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
            Endurance · Historie
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight lg:text-4xl">
            Trainings-Historie
          </h1>
          {runs.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {runs.length} Läufe · {totalKm.toFixed(0).replace(".", ",")} km gesamt
            </p>
          )}
        </header>

        {runs.length === 0 ? (
          <p className="rounded-2xl bg-muted/50 px-4 py-10 text-center text-sm text-muted-foreground">
            Noch keine Läufe erfasst. Synce deine Garmin-Daten über den
            „Sync“-Button auf der Endurance-Seite.
          </p>
        ) : (
          <div className="space-y-3">
            {runs.map((r) => (
              <HistoryCard key={r.id} run={r} />
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}

function HistoryCard({ run }: { run: RunSession }) {
  const km = run.distanceMeters / 1000;
  return (
    <Link
      href={`/endurance/${run.date}`}
      className="group block rounded-2xl bg-card p-5 ring-1 ring-black/5 shadow-sm transition hover:-translate-y-0.5 hover:ring-foreground/15 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#FC5200]/15 text-[#FC5200]">
            <Footprints className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">
              {formatLongDate(run.date)} · {formatActivityType(run.activityType)}
            </p>
            <p className="font-heading text-xl font-semibold tabular-nums">
              {km.toFixed(2).replace(".", ",")}{" "}
              <span className="text-sm font-normal text-muted-foreground">km</span>
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-heading text-lg font-semibold tabular-nums">
            {formatPace(run.avgPaceSecPerKm)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">/km</span>
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatSecondsAsHms(run.durationSeconds)}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-x-4 border-t border-border/60 pt-3 text-xs sm:grid-cols-4">
        <Mini label="Ø HF" value={run.avgHeartRate != null ? `${run.avgHeartRate} bpm` : "—"} />
        <Mini
          label="Höhenm."
          value={run.elevationGainMeters != null ? `${Math.round(run.elevationGainMeters)} m` : "—"}
        />
        <Mini label="Aerob TE" value={run.aerobicTrainingEffect?.toFixed(1) ?? "—"} />
        <Mini
          label="Load"
          value={run.trainingLoad != null ? Math.round(run.trainingLoad).toString() : "—"}
        />
      </dl>
    </Link>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function formatLongDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
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
