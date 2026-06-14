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
  getCurrentTrainingPlan,
  getDailyMetricsBetween,
  getLatestDailyMetrics,
  getUpcomingPlanSessions,
  getWeeklyKmTotals,
} from "@/lib/db/queries";
import { getLiveZoneContext } from "@/lib/endurance/live-zones";
import { toLocalISODate } from "@/lib/utils/date";

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
  const metricsHistoryFrom = new Date(today);
  metricsHistoryFrom.setDate(today.getDate() - 56);
  const metricsHistory = await getDailyMetricsBetween(
    metricsHistoryFrom.toISOString().slice(0, 10),
    toIso,
  );

  // Empfohlene Trainings (Card): nächste 3 Sessions aus dem aktiven Plan.
  // Historische Trainings (Card): letzte 3 Läufe (runs ist DESC).
  const todayIso = toLocalISODate();
  const plan = await getCurrentTrainingPlan();
  const upcoming = plan
    ? await getUpcomingPlanSessions(plan.id, todayIso, 3)
    : [];
  const recentRuns = runs.slice(0, 3);

  // Pace/HF pro Zone aus echten Lauf-Daten — zentral in live-zones.ts (gleiche
  // Quelle wie Plan-Paces auf /endurance/recommendations + Dashboard). runs und
  // Metrics sind schon geladen → wiederverwenden.
  const live = await getLiveZoneContext({ runs, latestMetrics, metricsHistory });

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

        <TrainingsSection
          upcoming={upcoming.map((s) => ({
            id: s.id,
            date: s.date,
            sessionType: s.sessionType,
            title: s.title,
            targetDistanceMeters: s.targetDistanceMeters,
            targetDurationSec: s.targetDurationSec,
            primaryZone: s.primaryZone,
          }))}
          recentRuns={recentRuns}
          hasPlan={plan != null}
          todayIso={todayIso}
        />

        <section className="rounded-3xl bg-card p-4 ring-1 ring-black/5 shadow-sm sm:p-6 lg:p-8">
          <div className="mb-4 space-y-1">
            <p className="text-[10px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
              Trainingszonen
            </p>
            <h2 className="font-heading text-lg font-semibold tracking-tight">
              Pace &amp; Herzfrequenz pro Zone
            </h2>
          </div>
          <TrainingZoneCalculator
            estimation={live.estimation}
            defaultLthr={live.lthr}
            defaultMarathonPredPace={live.defaultMarathonPredPace}
          />
        </section>
      </main>
    </AppShell>
  );
}
