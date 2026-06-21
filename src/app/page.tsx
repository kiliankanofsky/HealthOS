import Link from "next/link";

import {
  DailyOverviewCard,
  type OverviewData,
} from "@/components/dashboard/DailyOverviewCard";
import { DashboardChat } from "@/components/dashboard/DashboardChat";
import { GymCards } from "@/components/dashboard/GymCards";
import {
  MetaCalendar,
  type MetaMarker,
} from "@/components/dashboard/MetaCalendar";
import {
  NextSessionCard,
  type NextSessionBlockData,
} from "@/components/dashboard/NextSessionCard";
import {
  TotalsCard,
  type TotalsBar,
  type TotalsRow,
  type TotalsStat,
} from "@/components/dashboard/TotalsCard";
import { WeightCards } from "@/components/dashboard/WeightCards";
import { MetricsDashboard } from "@/components/endurance/MetricsDashboard";
import { AppShell } from "@/components/site/AppShell";
import { SyncNowButton } from "@/components/site/SyncNowButton";
import { phaseForDate } from "@/lib/dashboard/context";
import { getRecentGymSummaries } from "@/lib/dashboard/gym";
import {
  getAllPhases,
  getAllRunSessions,
  getAllSessions,
  getAllTemplates,
  getAllWeightEntries,
  getBlocksForPlanSession,
  getCurrentTrainingPlan,
  getDailyMetricsBetween,
  getDashboardOverviewForDate,
  getLatestDailyMetrics,
  getNextPlanSession,
  getRotationTemplates,
  getSessionsForPlan,
} from "@/lib/db/queries";
import { getLiveZoneContext } from "@/lib/endurance/live-zones";
import { sessionTypeLabel } from "@/lib/endurance/plan-format";
import { paletteClasses, templateVisuals } from "@/lib/hypertrophy/workouts";
import { toLocalISODate } from "@/lib/utils/date";
import { computeWeightStats } from "@/lib/utils/weight-stats";

export const dynamic = "force-dynamic";
// KI-Actions (Chat, Overview-Generierung) können nah ans Vercel-Hobby-Limit
// kommen — Page-Level maxDuration erbt auf die Server Actions.
export const maxDuration = 60;

export default async function DashboardPage() {
  const todayIso = toLocalISODate();

  const [
    runs,
    gymSessions,
    templates,
    gymSummaries,
    rotationTemplates,
    plan,
    weightEntries,
    phases,
    overviewRow,
    latestMetrics,
  ] = await Promise.all([
    getAllRunSessions(),
    getAllSessions(),
    getAllTemplates(),
    getRecentGymSummaries(10),
    getRotationTemplates(),
    getCurrentTrainingPlan(),
    getAllWeightEntries(),
    getAllPhases(),
    getDashboardOverviewForDate(todayIso),
    getLatestDailyMetrics(),
  ]);

  const rotationUnits = rotationTemplates.map((t) => ({
    slug: t.slug,
    name: t.name,
    color: t.color,
    letter: templateVisuals(t).letter,
  }));

  // 8-Wochen-Historie für die Metric-Popover-Charts (wie /endurance).
  const metricsHistory = await getDailyMetricsBetween(
    isoAddDays(todayIso, -56),
    todayIso,
  );

  // Pace/HF pro Zone aus den echten Lauf-Daten (= Trainingszonen-Card) für die
  // Nächste-Session-Card; runs + Metrics sind schon geladen → wiederverwenden.
  const liveZones = await getLiveZoneContext({
    runs,
    latestMetrics,
    metricsHistory,
  });

  // ---- Meta-Kalender: Läufe + Gym + geplante Plan-Sessions ----
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const markers: MetaMarker[] = [];

  for (const r of runs) {
    markers.push({
      date: r.date,
      kind: "run",
      href: `/endurance/${r.date}`,
      title: `Lauf · ${r.date}`,
    });
  }
  for (const s of gymSessions) {
    const tpl = templateById.get(s.templateId);
    if (!tpl) continue;
    markers.push({
      date: s.date,
      kind: "gym",
      href: `/hypertrophy/${tpl.slug}/${s.date}?scope=all`,
      title: `${tpl.name} · ${s.date}`,
      colorClass: paletteClasses(tpl.color).bg,
    });
  }

  // Geplante zukünftige Sessions aus dem aktiven Plan (hellgrau).
  let planSessions: Awaited<ReturnType<typeof getSessionsForPlan>> = [];
  if (plan) {
    planSessions = await getSessionsForPlan(plan.id);
    for (const s of planSessions) {
      if (s.date < todayIso || s.status !== "planned") continue;
      markers.push({
        date: s.date,
        kind: "planned",
        href: "/endurance/recommendations",
        title: `Geplant: ${sessionTypeLabel(s.sessionType)} · ${s.title}`,
      });
    }
  }

  // ---- Nächste Plan-Session ----
  const nextSession = plan
    ? ((await getNextPlanSession(plan.id, todayIso)) ?? null)
    : null;
  const nextBlocks: NextSessionBlockData[] = nextSession
    ? (await getBlocksForPlanSession(nextSession.id)).map((b) => ({
        repetitions: b.repetitions,
        description: b.description,
        segmentsJson: b.segmentsJson,
      }))
    : [];

  // ---- Wochen-Totals (Mo–So der aktuellen Woche) ----
  const dow = (new Date(`${todayIso}T00:00:00`).getDay() + 6) % 7;
  const mondayIso = isoAddDays(todayIso, -dow);
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    isoAddDays(mondayIso, i),
  );

  // Running
  const runsThisWeek = runs.filter(
    (r) => r.date >= mondayIso && r.date <= weekDays[6],
  );
  const runKmByDay = weekDays.map((iso) =>
    runsThisWeek
      .filter((r) => r.date === iso)
      .reduce((acc, r) => acc + r.distanceMeters, 0) / 1000,
  );
  const runSecByDay = weekDays.map((iso) =>
    runsThisWeek
      .filter((r) => r.date === iso)
      .reduce((acc, r) => acc + r.durationSeconds, 0),
  );
  const runningStats: TotalsStat[] = [
    {
      label: "Distanz",
      value: fmtDe(runKmByDay.reduce((a, b) => a + b, 0), 2),
      unit: "km",
    },
    { label: "Zeit", value: formatHm(runSecByDay.reduce((a, b) => a + b, 0)) },
    {
      label: "Höhe",
      value: String(
        Math.round(
          runsThisWeek.reduce((acc, r) => acc + (r.elevationGainMeters ?? 0), 0),
        ),
      ),
      unit: "m",
    },
  ];
  const runningBars: TotalsBar[] = weekDays.map((iso, i) => ({
    label: iso,
    value: runKmByDay[i],
    display: runKmByDay[i] > 0 ? fmtDe(runKmByDay[i], 1) : "0",
  }));
  const runningRows: TotalsRow[] = weekDays
    .map((iso, i) =>
      runSecByDay[i] > 0
        ? { label: weekdayLong(iso), value: formatHm(runSecByDay[i]) }
        : null,
    )
    .filter((r): r is TotalsRow => r !== null);
  const runningTotal: TotalsRow | null =
    runningRows.length > 0
      ? {
          label: "Total",
          value: formatHm(runSecByDay.reduce((a, b) => a + b, 0)),
        }
      : null;

  // Gym
  const gymThisWeek = gymSummaries.filter(
    (s) => s.date >= mondayIso && s.date <= weekDays[6],
  );
  const gymSetsByDay = weekDays.map((iso) =>
    gymThisWeek
      .filter((s) => s.date === iso)
      .reduce((acc, s) => acc + s.setCount, 0),
  );
  const gymStats: TotalsStat[] = [
    { label: "Sessions", value: String(gymThisWeek.length) },
    {
      label: "Sätze",
      value: String(gymThisWeek.reduce((acc, s) => acc + s.setCount, 0)),
    },
    {
      label: "Volumen",
      value: Math.round(
        gymThisWeek.reduce((acc, s) => acc + s.volume, 0),
      ).toLocaleString("de-DE"),
      unit: "kg",
    },
  ];
  const gymBars: TotalsBar[] = weekDays.map((iso, i) => ({
    label: iso,
    value: gymSetsByDay[i],
    display: gymSetsByDay[i] > 0 ? String(gymSetsByDay[i]) : "0",
  }));
  const gymRows: TotalsRow[] = gymThisWeek
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({
      label: weekdayLong(s.date),
      value: `${s.label} · ${s.setCount} Sätze`,
    }));

  // ---- Weight ----
  const weightStats = computeWeightStats(weightEntries);
  const phase = phaseForDate(phases, todayIso);

  const overview: OverviewData | null = overviewRow
    ? {
        enduranceText: overviewRow.enduranceText,
        hypertrophyText: overviewRow.hypertrophyText,
        weightText: overviewRow.weightText,
      }
    : null;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1280px] space-y-12 px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-14">
        {/* ---- Header ---- */}
        <header className="space-y-2">
          <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
            Übersicht
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            Health and Performance Dashboard
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Alle drei Module auf einen Blick — Workouts, Wochen-Totals,
            KI-Einordnung und deine aktuellen Werte.
          </p>
          <div className="pt-2">
            <SyncNowButton />
          </div>
        </header>

        {/* ---- Reihe 1: Meta-Kalender + Wochen-Totals ---- */}
        {/* items-start: Cards behalten ihre natürliche Höhe (Kalender wird
            sonst auf die Höhe der beiden Totals-Cards gestreckt). */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <section className="rounded-3xl bg-card p-4 ring-1 ring-black/5 shadow-sm sm:p-6 lg:col-span-2 lg:p-8">
            <MetaCalendar markers={markers} todayIso={todayIso} />
          </section>
          <div className="space-y-6">
            <section className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm">
              <TotalsCard
                heading="Running"
                stats={runningStats}
                bars={runningBars}
                rows={runningRows}
                totalRow={runningTotal}
              />
            </section>
            <section className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm">
              <TotalsCard
                heading="Gym"
                stats={gymStats}
                bars={gymBars}
                rows={gymRows}
                totalRow={null}
              />
            </section>
          </div>
        </div>

        {/* ---- Daily Overview: KI-Einordnung + Chat ---- */}
        <section className="space-y-6">
          <SectionHeader
            kicker="Daily"
            title="Daily Overview"
            sub="Tägliche KI-Einordnung deiner Bereiche und ein Assistent, der alle deine Daten kennt."
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-7">
              <DailyOverviewCard overview={overview} />
            </div>
            <div className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-7">
              <DashboardChat />
            </div>
          </div>
        </section>

        {/* ---- Endurance ---- */}
        <section className="space-y-6">
          <SectionHeader
            kicker="Endurance"
            title="Endurance"
            sub="Deine nächste geplante Einheit und die aktuellen Garmin-Metrics."
            href="/endurance"
          />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-7">
              <NextSessionCard
                session={nextSession}
                blocks={nextBlocks}
                paceZones={liveZones.paceZones ?? plan?.paceZonesJson ?? null}
                hrZones={liveZones.hrZones}
                todayIso={todayIso}
              />
            </div>
            <div className="rounded-3xl bg-card p-6 ring-1 ring-black/5 shadow-sm lg:p-7">
              <MetricsDashboard latest={latestMetrics} history={metricsHistory} />
            </div>
          </div>
        </section>

        {/* ---- Hypertrophy ---- */}
        <section className="space-y-6">
          <SectionHeader
            kicker="Hypertrophy"
            title="Hypertrophy"
            sub="Letzte Gym-Session und das nächste Workout in der Rotation."
            href="/hypertrophy"
          />
          <GymCards
            summaries={gymSummaries}
            rotation={rotationUnits}
            todayIso={todayIso}
          />
        </section>

        {/* ---- Weight ---- */}
        <section className="space-y-6">
          <SectionHeader
            kicker="Weight"
            title="Weight"
            sub={
              phase
                ? `Aktuelle Phase: ${PHASE_LABEL[phase.kind]} (seit ${phase.startDate}).`
                : "Keine aktive Phase hinterlegt."
            }
            href="/weight"
          />
          <WeightCards stats={weightStats} phaseKind={phase?.kind ?? null} />
        </section>
      </main>
    </AppShell>
  );
}

const PHASE_LABEL: Record<"cut" | "bulk" | "maintenance", string> = {
  cut: "Cut",
  bulk: "Bulk",
  maintenance: "Maintenance",
};

function SectionHeader({
  kicker,
  title,
  sub,
  href,
}: {
  kicker: string;
  title: string;
  sub: string;
  href?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <p className="text-[11px] font-medium tracking-[0.22em] text-primary uppercase">
          {kicker}
        </p>
        <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        <p className="max-w-xl text-sm text-muted-foreground">{sub}</p>
      </div>
      {href && (
        <Link
          href={href}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Alle Details →
        </Link>
      )}
    </div>
  );
}

// ---- Datums-/Format-Helfer (lokal) ----

function isoAddDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function weekdayLong(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("de-DE", {
    weekday: "long",
  });
}

// "5h 4m" / "42m"
function formatHm(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// Deutsche Dezimal-Schreibweise ("57,61").
function fmtDe(n: number, digits: number): string {
  return n.toFixed(digits).replace(".", ",");
}
