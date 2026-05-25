import {
  KmGraphSection,
  type WeekKm,
} from "@/components/endurance/KmGraphSection";
import { MetricsDashboard } from "@/components/endurance/MetricsDashboard";
import {
  type CalendarTag,
  RunCalendar,
  type RunMarker,
} from "@/components/endurance/RunCalendar";
import { TrainingsSection } from "@/components/endurance/TrainingsSection";
import { AppShell } from "@/components/site/AppShell";
import {
  getAllDailyTags,
  getAllRunSessions,
  getDailyMetricsBetween,
  getLatestDailyMetrics,
  getLatestRunSession,
  getWeeklyKmTotals,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function EndurancePage() {
  const runs = await getAllRunSessions();
  const markers: RunMarker[] = runs.map((r) => ({
    date: r.date,
    activityType: r.activityType,
  }));

  // Cheat-Day / Alkohol-Tags aus daily_tags (eigene Tabelle, getrennt von
  // weight_entries) — analog Hypertrophy.
  const tags: CalendarTag[] = (await getAllDailyTags())
    .filter((t) => t.cheatDay || t.alcohol)
    .map((t) => ({ date: t.date, cheatDay: t.cheatDay, alcohol: t.alcohol }));

  // 12-Wochen-Fenster für die Kilometergrafik (90 Tage zurück bis heute).
  const today = new Date();
  const toIso = today.toISOString().slice(0, 10);
  const from = new Date(today);
  from.setDate(today.getDate() - 90);
  const fromIso = from.toISOString().slice(0, 10);
  const weeklyRaw = await getWeeklyKmTotals(fromIso, toIso);
  const weeks: WeekKm[] = weeklyRaw.map((w) => ({
    weekStartIso: w.weekStartIso,
    km: w.km,
  }));

  // Aktuelle Woche aggregieren (Mo bis heute, lokal).
  const dow = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  const mondayIso = monday.toISOString().slice(0, 10);
  const thisWeekRuns = runs.filter((r) => r.date >= mondayIso);
  const thisWeek = {
    distanceKm:
      thisWeekRuns.reduce((acc, r) => acc + r.distanceMeters, 0) / 1000,
    durationSec: thisWeekRuns.reduce((acc, r) => acc + r.durationSeconds, 0),
    elevationMeters: thisWeekRuns.reduce(
      (acc, r) => acc + (r.elevationGainMeters ?? 0),
      0,
    ),
  };

  // Jüngste Snapshots + 8-Wochen-Historie für die Popover-Charts.
  const latestMetrics = await getLatestDailyMetrics();
  const latestRun = await getLatestRunSession();
  const metricsHistoryFrom = new Date(today);
  metricsHistoryFrom.setDate(today.getDate() - 56);
  const metricsHistory = await getDailyMetricsBetween(
    metricsHistoryFrom.toISOString().slice(0, 10),
    toIso,
  );

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1280px] space-y-10 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
        <header className="space-y-2">
          <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
            Endurance
          </p>
          <h1 className="font-heading text-4xl font-semibold tracking-tight lg:text-5xl">
            Run Log
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Wöchentliche Distanz, Kalender vergangener Läufe und Garmin-Metrics
            — alles auf einer Seite.
          </p>
        </header>

        <KmGraphSection weeks={weeks} thisWeek={thisWeek} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:col-span-2 lg:p-8">
            <RunCalendar markers={markers} tags={tags} />
          </section>
          <section className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-8">
            <MetricsDashboard latest={latestMetrics} history={metricsHistory} />
          </section>
        </div>

        <TrainingsSection latestRun={latestRun} />
      </main>
    </AppShell>
  );
}
