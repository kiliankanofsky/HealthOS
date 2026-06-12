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
import { TrainingZoneCalculator } from "@/components/endurance/TrainingZoneCalculator";
import { AppShell } from "@/components/site/AppShell";
import { SyncNowButton } from "@/components/site/SyncNowButton";
import {
  getAllDailyTags,
  getAllRunSessions,
  getDailyMetricsBetween,
  getLatestDailyMetrics,
  getLatestRunSession,
  getWeeklyKmTotals,
} from "@/lib/db/queries";
import { estimateZonesFromRuns } from "@/lib/endurance/zone-estimation";

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

  // Zone-Calculator-Defaults: jüngster nicht-leerer Lactate-Threshold-Wert
  // (Garmin liefert die LT-Felder nicht jeden Tag).
  const newestFirst = [...metricsHistory].sort((a, b) =>
    b.date.localeCompare(a.date),
  );
  const defaultLtPace =
    latestMetrics?.lactateThresholdPaceSecPerKm ??
    newestFirst.find((m) => m.lactateThresholdPaceSecPerKm != null)
      ?.lactateThresholdPaceSecPerKm ??
    null;
  const defaultLthr =
    latestMetrics?.lactateThresholdHr ??
    newestFirst.find((m) => m.lactateThresholdHr != null)?.lactateThresholdHr ??
    null;

  // Empirische Zonen-Schätzung aus den Splits der letzten 180 Tage
  // (Steady-Läufe → Pace↔HF-Regression, Intervalle → Z5-Anker).
  const estimationFrom = new Date(today);
  estimationFrom.setDate(today.getDate() - 180);
  const estimationFromIso = estimationFrom.toISOString().slice(0, 10);
  const zoneEstimation = estimateZonesFromRuns(
    runs.filter((r) => r.date >= estimationFromIso),
    estimationFromIso,
    toIso,
  );

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1280px] space-y-10 px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-14">
        <header className="space-y-2">
          <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
            Endurance
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            Run Log
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Wöchentliche Distanz, Kalender vergangener Läufe und Garmin-Metrics
            — alles auf einer Seite.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <SyncNowButton />
          </div>
        </header>

        <KmGraphSection weeks={weeks} thisWeek={thisWeek} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-3xl bg-card p-4 ring-1 ring-black/5 shadow-sm sm:p-6 lg:col-span-2 lg:p-8">
            <RunCalendar markers={markers} tags={tags} />
          </section>
          <section className="rounded-3xl bg-card p-4 ring-1 ring-black/5 shadow-sm sm:p-6 lg:p-8">
            <MetricsDashboard latest={latestMetrics} history={metricsHistory} />
          </section>
        </div>

        <section className="rounded-3xl bg-card p-4 ring-1 ring-black/5 shadow-sm sm:p-6 lg:p-8">
          <div className="mb-5 space-y-1">
            <h2 className="font-heading text-xl font-semibold tracking-tight">
              Training Zone Calculator
            </h2>
            <p className="text-sm text-muted-foreground">
              Pace- und HF-Zonen aus deinen echten Läufen: Steady-Splits
              liefern die Pace↔HF-Beziehung, Intervalle den VO₂max-Anker.
              LTHR aus Garmin, überschreibbar.
            </p>
          </div>
          <TrainingZoneCalculator
            estimation={zoneEstimation}
            defaultThresholdPaceSecPerKm={defaultLtPace}
            defaultLthr={defaultLthr}
          />
        </section>

        <TrainingsSection latestRun={latestRun} />
      </main>
    </AppShell>
  );
}
