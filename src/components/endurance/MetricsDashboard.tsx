"use client";

import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Gauge,
  HeartPulse,
  Moon,
  Target,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { GarminDailyMetrics } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type Props = {
  latest: GarminDailyMetrics | undefined;
  history: GarminDailyMetrics[];
};

const RHR_COLOR = "#ef4444"; // rot — für Herzfrequenz
const HRV_COLOR = "#22c55e"; // grün — für HRV
const BASELINE_COLOR = "#22c55e";
const SLEEP_COLORS = {
  deep: "#1d4ed8",
  light: "#60a5fa",
  rem: "#a855f7",
  awake: "#94a3b8",
} as const;

export function MetricsDashboard({ latest, history }: Props) {
  return (
    <div className="space-y-8">
      <DashboardSection title="Longevity-Metrics">
        <div className="grid grid-cols-3 gap-3">
          <RhrTile latest={latest} history={history} />
          <HrvTile latest={latest} history={history} />
          <SleepTile latest={latest} history={history} />
        </div>
      </DashboardSection>

      <DashboardSection title="Performance-Metrics">
        <div className="grid grid-cols-2 gap-3">
          <RacePredictionTile latest={latest} />
          <TrainingStatusTile latest={latest} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Vo2Tile latest={latest} />
          <LactateThresholdTile latest={latest} />
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

// ============================================================
// Generisches Tile (Popover-Trigger).
// ============================================================
function MetricTile({
  icon,
  label,
  value,
  unit,
  sub,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  children: React.ReactNode; // popover-Inhalt
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "group w-full rounded-xl border border-border/60 bg-card/40 p-3 text-left transition",
          "hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md",
          "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
        )}
      >
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <p className="mt-2 font-heading text-xl font-semibold tabular-nums leading-tight">
          {value}
          {unit && value !== "—" && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {unit}
            </span>
          )}
        </p>
        {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
      </PopoverTrigger>
      <PopoverContent
        className="w-[40rem] max-w-[calc(100vw-2rem)] p-5"
        align="center"
        side="bottom"
        sideOffset={8}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

// ============================================================
// 1) Resting Heart Rate — Tile + Popover (8 Wochen pro Nacht + 7d-Avg + Tagesdetail).
// ============================================================
function RhrTile({
  latest,
  history,
}: {
  latest: GarminDailyMetrics | undefined;
  history: GarminDailyMetrics[];
}) {
  const eightWeeks = useMemo(() => sliceLastDays(history, 56), [history]);
  const data = useMemo(
    () =>
      eightWeeks.map((m) => ({
        date: m.date,
        rhr: m.restingHeartRate,
        avg7d: m.restingHeartRate7dAvg,
      })),
    [eightWeeks],
  );

  // Default-Auswahl: der letzte Tag mit Wert (üblicherweise = latest).
  const defaultDate = useMemo(() => {
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].rhr !== null) return data[i].date;
    }
    return data.at(-1)?.date ?? null;
  }, [data]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const activeDate = selectedDate ?? defaultDate;
  const activeIdx = data.findIndex((d) => d.date === activeDate);
  const activePoint = activeIdx >= 0 ? data[activeIdx] : undefined;

  const rhr = latest?.restingHeartRate ?? null;
  const avg7d = latest?.restingHeartRate7dAvg ?? null;
  const activeRhr = activePoint?.rhr ?? null;
  const activeAvg = activePoint?.avg7d ?? null;
  const delta = activeRhr !== null && activeAvg !== null ? activeRhr - activeAvg : null;

  return (
    <MetricTile
      icon={<HeartPulse className="size-4" />}
      label="Ruhepuls"
      value={rhr ?? "—"}
      unit="bpm"
      sub={avg7d !== null ? `Ø 7T: ${avg7d} bpm` : undefined}
    >
      <PopoverHead
        title="Ruhepuls"
        subtitle={
          rhr !== null
            ? `Aktuell ${rhr} bpm${avg7d !== null ? ` · Ø 7 Tage: ${avg7d} bpm` : ""}`
            : "Keine Daten"
        }
      />
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
            onClick={(e) => {
              const label = (e as { activeLabel?: string | number } | null)
                ?.activeLabel;
              if (typeof label === "string") setSelectedDate(label);
            }}
          >
            <CartesianGrid stroke="currentColor" strokeOpacity={0.1} vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }}
              tickFormatter={shortDate}
              minTickGap={20}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={28}
              tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }}
              domain={["dataMin - 2", "dataMax + 2"]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(d) =>
                typeof d === "string" ? formatDeLong(d) : ""
              }
              formatter={(v, name) => [
                typeof v === "number" ? `${v} bpm` : "—",
                name === "rhr" ? "RHR" : "Ø 7T",
              ]}
            />
            <Line
              type="linear"
              dataKey="rhr"
              stroke={RHR_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: RHR_COLOR, stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              type="linear"
              dataKey="avg7d"
              stroke={RHR_COLOR}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeOpacity={0.55}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <DailyDetailRow
        date={activePoint?.date ?? null}
        items={[
          { label: "Ruhepuls", value: activeRhr !== null ? `${activeRhr} bpm` : "—" },
          { label: "Ø 7 Tage", value: activeAvg !== null ? `${activeAvg} bpm` : "—" },
          {
            label: "Δ zum Mittel",
            value:
              delta !== null
                ? `${delta > 0 ? "+" : ""}${delta} bpm`
                : "—",
          },
        ]}
        canPrev={activeIdx > 0}
        canNext={activeIdx >= 0 && activeIdx < data.length - 1}
        onPrev={() => {
          if (activeIdx > 0) setSelectedDate(data[activeIdx - 1].date);
        }}
        onNext={() => {
          if (activeIdx >= 0 && activeIdx < data.length - 1)
            setSelectedDate(data[activeIdx + 1].date);
        }}
      />

      <PopoverFootnote>
        Letzte 8 Wochen · durchgezogen = pro Nacht · gestrichelt = 7-Tage-Mittel.
        Klick auf die Linie wechselt den Detail-Tag. Quelle: Garmin Connect.
      </PopoverFootnote>
    </MetricTile>
  );
}

// ============================================================
// 2) HRV — Tile + Popover mit Baseline-Korridor.
// ============================================================
function HrvTile({
  latest,
  history,
}: {
  latest: GarminDailyMetrics | undefined;
  history: GarminDailyMetrics[];
}) {
  const eightWeeks = useMemo(() => sliceLastDays(history, 56), [history]);
  const data = useMemo(
    () =>
      eightWeeks.map((m) => ({
        date: m.date,
        hrv: m.hrvLastNight,
      })),
    [eightWeeks],
  );

  // Baseline aus dem jüngsten Eintrag, der einen Korridor liefert.
  const baseline = useMemo(() => {
    for (let i = eightWeeks.length - 1; i >= 0; i--) {
      const m = eightWeeks[i];
      if (
        m.hrvBaselineBalancedLow !== null &&
        m.hrvBaselineBalancedUpper !== null
      ) {
        return {
          balancedLow: m.hrvBaselineBalancedLow,
          balancedUpper: m.hrvBaselineBalancedUpper,
          lowUpper: m.hrvBaselineLowUpper,
        };
      }
    }
    return null;
  }, [eightWeeks]);

  const defaultDate = useMemo(() => {
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].hrv !== null) return data[i].date;
    }
    return data.at(-1)?.date ?? null;
  }, [data]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const activeDate = selectedDate ?? defaultDate;
  const activeIdx = data.findIndex((d) => d.date === activeDate);
  const activePoint = activeIdx >= 0 ? data[activeIdx] : undefined;

  const hrv = latest?.hrvLastNight ?? null;
  const status = latest?.hrvStatus ?? null;
  const activeHrv = activePoint?.hrv ?? null;

  // Position im Korridor für den aktiven Tag.
  const corridorLabel: string = (() => {
    if (activeHrv === null || !baseline) return "—";
    if (activeHrv >= baseline.balancedLow && activeHrv <= baseline.balancedUpper)
      return "Balanced";
    if (activeHrv > baseline.balancedUpper) return "Über Korridor";
    return "Unter Korridor";
  })();

  return (
    <MetricTile
      icon={<Activity className="size-4" />}
      label="HRV"
      value={hrv ?? "—"}
      unit="ms"
      sub={status ? <StatusPill status={status} /> : undefined}
    >
      <PopoverHead
        title="Herzfrequenzvariabilität"
        subtitle={
          hrv !== null
            ? `Letzte Nacht: ${hrv} ms${status ? ` · Status: ${formatStatus(status)}` : ""}`
            : "Keine Daten"
        }
      />
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
            onClick={(e) => {
              const label = (e as { activeLabel?: string | number } | null)
                ?.activeLabel;
              if (typeof label === "string") setSelectedDate(label);
            }}
          >
            <CartesianGrid stroke="currentColor" strokeOpacity={0.1} vertical={false} />
            {baseline && (
              <ReferenceArea
                y1={baseline.balancedLow}
                y2={baseline.balancedUpper}
                fill={BASELINE_COLOR}
                fillOpacity={0.12}
                stroke="none"
                ifOverflow="extendDomain"
              />
            )}
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }}
              tickFormatter={shortDate}
              minTickGap={20}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={28}
              tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }}
              domain={["dataMin - 5", "dataMax + 5"]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(d) =>
                typeof d === "string" ? formatDeLong(d) : ""
              }
              formatter={(v) => [
                typeof v === "number" ? `${v} ms` : "—",
                "HRV",
              ]}
            />
            <Line
              type="linear"
              dataKey="hrv"
              stroke={HRV_COLOR}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: HRV_COLOR, stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <DailyDetailRow
        date={activePoint?.date ?? null}
        items={[
          { label: "HRV", value: activeHrv !== null ? `${activeHrv} ms` : "—" },
          {
            label: "Korridor",
            value: baseline
              ? `${Math.round(baseline.balancedLow)}–${Math.round(baseline.balancedUpper)} ms`
              : "—",
          },
          { label: "Position", value: corridorLabel },
        ]}
        canPrev={activeIdx > 0}
        canNext={activeIdx >= 0 && activeIdx < data.length - 1}
        onPrev={() => {
          if (activeIdx > 0) setSelectedDate(data[activeIdx - 1].date);
        }}
        onNext={() => {
          if (activeIdx >= 0 && activeIdx < data.length - 1)
            setSelectedDate(data[activeIdx + 1].date);
        }}
      />

      <PopoverFootnote>
        Grüner Bereich = Garmin&apos;s &quot;balanced&quot;-Korridor
        {baseline
          ? ` (${Math.round(baseline.balancedLow)}–${Math.round(baseline.balancedUpper)} ms)`
          : ""}
        . Klick auf die Linie wechselt den Detail-Tag. Quelle: Garmin Connect.
      </PopoverFootnote>
    </MetricTile>
  );
}

// ============================================================
// 3) Sleep — Tile + Popover mit gestacktem Stadien-Balken + Score-Trend.
// ============================================================
function SleepTile({
  latest,
  history,
}: {
  latest: GarminDailyMetrics | undefined;
  history: GarminDailyMetrics[];
}) {
  // Letzte ~12 Wochen für den Trend + um darin per Click/Buttons zu navigieren.
  const trendWindow = useMemo(() => sliceLastDays(history, 84), [history]);

  const defaultDate = useMemo(() => {
    for (let i = trendWindow.length - 1; i >= 0; i--) {
      if (trendWindow[i].sleepScore !== null) return trendWindow[i].date;
    }
    return trendWindow.at(-1)?.date ?? null;
  }, [trendWindow]);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const activeDate = selectedDate ?? defaultDate;
  const activeIdx = trendWindow.findIndex((d) => d.date === activeDate);
  // Daten des aktiven Tages: bevorzugt aus der Historie, fallback auf latest.
  const active =
    (activeIdx >= 0 ? trendWindow[activeIdx] : undefined) ?? latest;

  // Stadien-Daten für den AKTIVEN Tag.
  const stackData = useMemo(() => {
    if (!active) return [];
    return [
      {
        name: "Schlaf",
        deep: active.deepSleepSec ?? 0,
        light: active.lightSleepSec ?? 0,
        rem: active.remSleepSec ?? 0,
        awake: active.awakeSleepSec ?? 0,
      },
    ];
  }, [active]);

  const stageLegend = useMemo(() => {
    if (!active) return [];
    return [
      { key: "deep", label: "Tief", color: SLEEP_COLORS.deep, sec: active.deepSleepSec ?? 0 },
      { key: "light", label: "Leicht", color: SLEEP_COLORS.light, sec: active.lightSleepSec ?? 0 },
      { key: "rem", label: "REM", color: SLEEP_COLORS.rem, sec: active.remSleepSec ?? 0 },
      { key: "awake", label: "Wach", color: SLEEP_COLORS.awake, sec: active.awakeSleepSec ?? 0 },
    ];
  }, [active]);

  const totalSec = stageLegend.reduce((acc, s) => acc + s.sec, 0);

  const scoreTrend = useMemo(
    () => trendWindow.map((m) => ({ date: m.date, score: m.sleepScore })),
    [trendWindow],
  );

  // Tile-Preview verwendet den jüngsten Wert (latest), nicht den ausgewählten.
  const previewScore = latest?.sleepScore ?? null;
  const previewQuality = latest?.sleepQuality ?? null;

  return (
    <MetricTile
      icon={<Moon className="size-4" />}
      label="Sleep"
      value={previewScore ?? "—"}
      unit="/100"
      sub={previewQuality ? formatStatus(previewQuality) : undefined}
    >
      <PopoverHead
        title="Schlaf"
        subtitle={
          previewScore !== null
            ? `Score: ${previewScore} · ${previewQuality ? formatStatus(previewQuality) : ""}`
            : "Keine Daten"
        }
      />

      {/* Zwei-Spalten-Layout:
          Links — großer vertikaler gestackter Balken mit Legende.
          Rechts — kompakterer Sleep-Score-Trend, schlanker und kürzer. */}
      <div className="grid grid-cols-[13rem_1fr] gap-5">
        {/* === LINKS: vertikaler Stack-Bar (deutlich größer) === */}
        {totalSec > 0 ? (
          <div className="flex gap-4">
            <div className="h-72 w-20">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stackData}
                  margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
                  barCategoryGap={0}
                >
                  <XAxis type="category" dataKey="name" hide />
                  <YAxis type="number" hide domain={[0, totalSec]} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v, name) => [
                      typeof v === "number" ? formatHm(v) : "—",
                      sleepStageLabel(String(name)),
                    ]}
                    labelFormatter={() => ""}
                  />
                  <Bar
                    dataKey="awake"
                    stackId="s"
                    fill={SLEEP_COLORS.awake}
                    radius={[0, 0, 8, 8]}
                  />
                  <Bar dataKey="light" stackId="s" fill={SLEEP_COLORS.light} />
                  <Bar dataKey="rem" stackId="s" fill={SLEEP_COLORS.rem} />
                  <Bar
                    dataKey="deep"
                    stackId="s"
                    fill={SLEEP_COLORS.deep}
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-1 flex-col justify-between py-1 text-xs">
              {[
                stageLegend.find((s) => s.key === "deep"),
                stageLegend.find((s) => s.key === "rem"),
                stageLegend.find((s) => s.key === "light"),
                stageLegend.find((s) => s.key === "awake"),
              ]
                .filter((s): s is (typeof stageLegend)[number] => Boolean(s))
                .map((s) => (
                  <div key={s.key}>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block size-2 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-muted-foreground">{s.label}</span>
                    </div>
                    <p className="mt-0.5 font-medium tabular-nums">
                      {formatHm(s.sec)}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Keine Stadien-Daten.</p>
        )}

        {/* === RECHTS: Sleep-Score-Trend, schlanker === */}
        <div className="flex flex-col">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Sleep Score — letzte 12 Wochen
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={scoreTrend}
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                onClick={(e) => {
                  const label = (e as { activeLabel?: string | number } | null)
                    ?.activeLabel;
                  if (typeof label === "string") setSelectedDate(label);
                }}
              >
                <CartesianGrid
                  stroke="currentColor"
                  strokeOpacity={0.1}
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }}
                  tickFormatter={shortDate}
                  minTickGap={20}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={28}
                  tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }}
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(d) =>
                    typeof d === "string" ? formatDeLong(d) : ""
                  }
                  formatter={(v) => [
                    typeof v === "number" ? `${v}/100` : "—",
                    "Sleep Score",
                  ]}
                />
                <Line
                  type="linear"
                  dataKey="score"
                  stroke={SLEEP_COLORS.rem}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: SLEEP_COLORS.rem,
                    stroke: "#fff",
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tagesdetails-Card mit Buttons — analog HRV/RHR. */}
      <DailyDetailRow
        date={active?.date ?? null}
        items={[
          {
            label: "Score",
            value: active?.sleepScore !== null && active?.sleepScore !== undefined
              ? String(active.sleepScore)
              : "—",
          },
          {
            label: "Dauer",
            value: active?.sleepDurationSec
              ? formatHm(active.sleepDurationSec)
              : "—",
          },
          {
            label: "Qualität",
            value: active?.sleepQuality ? formatStatus(active.sleepQuality) : "—",
          },
          {
            label: "Schlafenszeit",
            value: formatLocalTime(active?.sleepStartLocal ?? null),
          },
          {
            label: "Aufstehzeit",
            value: formatLocalTime(active?.sleepEndLocal ?? null),
          },
        ]}
        canPrev={activeIdx > 0}
        canNext={activeIdx >= 0 && activeIdx < trendWindow.length - 1}
        onPrev={() => {
          if (activeIdx > 0) setSelectedDate(trendWindow[activeIdx - 1].date);
        }}
        onNext={() => {
          if (activeIdx >= 0 && activeIdx < trendWindow.length - 1)
            setSelectedDate(trendWindow[activeIdx + 1].date);
        }}
      />

      <PopoverFootnote>Quelle: Garmin Connect Sleep</PopoverFootnote>
    </MetricTile>
  );
}

function sleepStageLabel(key: string): string {
  return (
    { deep: "Tief", light: "Leicht", rem: "REM", awake: "Wach" }[key] ?? key
  );
}

// ============================================================
// 4) Race-Predictions — EINE Tile, Popover zeigt alle 4.
// ============================================================
function RacePredictionTile({
  latest,
}: {
  latest: GarminDailyMetrics | undefined;
}) {
  const rows: { label: string; sec: number | null; key: string }[] = [
    { key: "5k", label: "5 km", sec: latest?.racePrediction5k ?? null },
    { key: "10k", label: "10 km", sec: latest?.racePrediction10k ?? null },
    {
      key: "hm",
      label: "Halbmarathon",
      sec: latest?.racePredictionHalfMarathon ?? null,
    },
    {
      key: "m",
      label: "Marathon",
      sec: latest?.racePredictionMarathon ?? null,
    },
  ];

  // Preview = die kürzeste Distanz mit Wert, sonst "—".
  const preview = rows.find((r) => r.sec !== null);
  const previewValue = preview?.sec ? formatDuration(preview.sec) : "—";

  return (
    <MetricTile
      icon={<TrendingUp className="size-4" />}
      label="Lauf-Prognose"
      value={previewValue}
      sub={preview ? preview.label : "Keine Daten"}
    >
      <PopoverHead
        title="Lauf-Prognosen"
        subtitle="Garmin Race-Predictions basierend auf aktuellem Fitness-Level"
      />
      <div className="grid grid-cols-2 gap-2">
        {rows.map((r) => (
          <div
            key={r.key}
            className="rounded-lg border border-border/60 bg-card/40 px-3 py-2.5"
          >
            <p className="text-[11px] text-muted-foreground">{r.label}</p>
            <p className="mt-0.5 font-heading text-lg font-semibold tabular-nums">
              {r.sec !== null ? formatDuration(r.sec) : "—"}
            </p>
          </div>
        ))}
      </div>
      <PopoverFootnote>Quelle: Garmin Connect Race Predictor</PopoverFootnote>
    </MetricTile>
  );
}

// ============================================================
// 5) Training Status — Tile + Popover mit Garmin-Detail.
// ============================================================
function TrainingStatusTile({
  latest,
}: {
  latest: GarminDailyMetrics | undefined;
}) {
  const status = latest?.trainingStatus ?? null;

  // Garmin packt manchmal weitere Details in raw_json — wir greifen das auf,
  // wenn vorhanden, ansonsten zeigen wir nur den Feedback-String.
  const tsDetail = useMemo(() => {
    if (!latest?.rawJson) return null;
    try {
      const parsed = JSON.parse(latest.rawJson) as {
        trainingStatus?: {
          latestTrainingStatusData?: Record<
            string,
            {
              trainingStatusFeedbackPhrase?: string;
              fitnessTrend?: number;
              weeklyTrainingLoad?: number;
              loadLevelTrend?: string;
              acuteTrainingLoadDTO?: {
                dailyTrainingLoadAcute?: number;
                acwrPercent?: number;
                acwrStatus?: string;
              };
            }
          >;
        };
      };
      const map = parsed.trainingStatus?.latestTrainingStatusData;
      if (!map) return null;
      const firstKey = Object.keys(map)[0];
      return firstKey ? map[firstKey] : null;
    } catch {
      return null;
    }
  }, [latest?.rawJson]);

  return (
    <MetricTile
      icon={<Target className="size-4" />}
      label="Trainingszustand"
      value={status ? formatStatus(status) : "—"}
    >
      <PopoverHead
        title="Trainingszustand"
        subtitle={status ? formatStatus(status) : "Keine Daten"}
      />
      {tsDetail ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          {typeof tsDetail.fitnessTrend === "number" && (
            <Field label="Fitness-Trend" value={tsDetail.fitnessTrend.toFixed(1)} />
          )}
          {typeof tsDetail.weeklyTrainingLoad === "number" && (
            <Field
              label="Wochen-Load"
              value={Math.round(tsDetail.weeklyTrainingLoad).toString()}
            />
          )}
          {tsDetail.loadLevelTrend && (
            <Field label="Load-Trend" value={formatStatus(tsDetail.loadLevelTrend)} />
          )}
          {typeof tsDetail.acuteTrainingLoadDTO?.dailyTrainingLoadAcute ===
            "number" && (
            <Field
              label="Acute Load"
              value={Math.round(
                tsDetail.acuteTrainingLoadDTO.dailyTrainingLoadAcute,
              ).toString()}
            />
          )}
          {typeof tsDetail.acuteTrainingLoadDTO?.acwrPercent === "number" && (
            <Field
              label="ACWR"
              value={`${Math.round(tsDetail.acuteTrainingLoadDTO.acwrPercent)} %`}
            />
          )}
          {tsDetail.acuteTrainingLoadDTO?.acwrStatus && (
            <Field
              label="ACWR-Status"
              value={formatStatus(tsDetail.acuteTrainingLoadDTO.acwrStatus)}
            />
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Keine zusätzlichen Details von Garmin verfügbar.
        </p>
      )}
      <PopoverFootnote>Quelle: Garmin Connect Training Status</PopoverFootnote>
    </MetricTile>
  );
}

// ============================================================
// 6) VO2 Max — Tile + Popover mit großer Zahl.
// ============================================================
function Vo2Tile({ latest }: { latest: GarminDailyMetrics | undefined }) {
  const v = latest?.vo2MaxRunning ?? null;
  return (
    <MetricTile
      icon={<Gauge className="size-4" />}
      label="VO₂ Max"
      value={v !== null ? v.toFixed(1).replace(".", ",") : "—"}
      unit="ml/kg/min"
    >
      <PopoverHead
        title="VO₂ Max (Running)"
        subtitle="Maximale Sauerstoffaufnahme — Garmin schätzt sie aus deinen Läufen."
      />
      <div className="flex flex-col items-center justify-center py-4">
        <p className="font-heading text-6xl font-semibold tabular-nums">
          {v !== null ? v.toFixed(1).replace(".", ",") : "—"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">ml/kg/min · Lauf</p>
      </div>
      <PopoverFootnote>
        Quelle: Garmin Connect (metrics-service/maxmet). Wert wird typischerweise
        nach längeren Outdoor-Läufen mit Pulsgurt aktualisiert.
      </PopoverFootnote>
    </MetricTile>
  );
}

// ============================================================
// 7) Lactate Threshold — Pace ist primär, HR sekundär.
// ============================================================
function LactateThresholdTile({
  latest,
}: {
  latest: GarminDailyMetrics | undefined;
}) {
  const pace = latest?.lactateThresholdPaceSecPerKm ?? null;
  const hr = latest?.lactateThresholdHr ?? null;

  return (
    <MetricTile
      icon={<HeartPulse className="size-4" />}
      label="Laktatschwelle"
      value={formatPace(pace)}
      unit="/km"
      sub={hr !== null ? `${hr} bpm` : undefined}
    >
      <PopoverHead
        title="Laktatschwelle"
        subtitle="Pace bzw. Herzfrequenz an der anaeroben Schwelle"
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border/60 bg-card/40 px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Pace</p>
          <p className="mt-0.5 font-heading text-2xl font-semibold tabular-nums">
            {formatPace(pace)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              /km
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/40 px-4 py-3">
          <p className="text-[11px] text-muted-foreground">Herzfrequenz</p>
          <p className="mt-0.5 font-heading text-2xl font-semibold tabular-nums">
            {hr !== null ? hr : "—"}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              bpm
            </span>
          </p>
        </div>
      </div>
      <PopoverFootnote>
        Quelle: Garmin Connect (Lactate-Threshold-Schätzung).
      </PopoverFootnote>
    </MetricTile>
  );
}

// ============================================================
// shared helpers
// ============================================================

// Detail-Zeile unter den Trend-Charts: zeigt Werte für den aktuell
// ausgewählten Tag. Per Click in der Linie ODER per Pfeil-Buttons wechselt
// der Tag.
function DailyDetailRow({
  date,
  items,
  onPrev,
  onNext,
  canPrev = false,
  canNext = false,
}: {
  date: string | null;
  items: { label: string; value: string }[];
  onPrev?: () => void;
  onNext?: () => void;
  canPrev?: boolean;
  canNext?: boolean;
}) {
  return (
    <div className="mt-3 rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
          Tagesdetail · {date ? formatDeLong(date) : "—"}
        </p>
        <div className="flex items-center gap-1">
          <NavArrow
            direction="prev"
            disabled={!canPrev}
            onClick={onPrev}
            aria-label="Vorheriger Tag"
          />
          <NavArrow
            direction="next"
            disabled={!canNext}
            onClick={onNext}
            aria-label="Nächster Tag"
          />
        </div>
      </div>
      <div
        className="mt-1.5 grid gap-x-4 gap-y-1"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((it) => (
          <div key={it.label}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
              {it.label}
            </p>
            <p className="mt-0.5 font-medium tabular-nums">{it.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function NavArrow({
  direction,
  disabled,
  onClick,
  ...props
}: {
  direction: "prev" | "next";
  disabled?: boolean;
  onClick?: () => void;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        "disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:cursor-not-allowed",
      )}
      {...props}
    >
      {direction === "prev" ? (
        <ChevronLeft className="size-4" />
      ) : (
        <ChevronRight className="size-4" />
      )}
    </button>
  );
}

function PopoverHead({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-3">
      <p className="font-heading text-base font-semibold">{title}</p>
      {subtitle && (
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

function PopoverFootnote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
      {children}
    </p>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
        {label}
      </p>
      <p className="mt-0.5 font-medium tabular-nums">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const positive = /balanced|productive|optimal/i.test(status);
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
        positive
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
          : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      )}
    >
      {formatStatus(status)}
    </span>
  );
}

function sliceLastDays<T extends { date: string }>(
  rows: T[],
  days: number,
): T[] {
  if (rows.length <= days) return rows;
  return rows.slice(rows.length - days);
}

function shortDate(d: string): string {
  if (typeof d !== "string" || d.length < 10) return "";
  return d.slice(5).replace("-", ".");
}

function formatDeLong(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(secPerKm: number | null): string {
  if (secPerKm === null) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatHm(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

function formatStatus(s: string): string {
  return s
    .toLowerCase()
    .split("_")
    .filter((p) => !/^\d+$/.test(p))
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function formatLocalTime(iso: string | null): string {
  if (!iso) return "—";
  // Garmin liefert ISO-Strings in Lokalzeit ohne Offset (z.B. "2026-05-25T23:14:00.000Z"
  // ist eigentlich lokal). Wir extrahieren stumpf HH:MM.
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : "—";
}

const tooltipStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  padding: "8px 12px",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
  backgroundColor: "var(--card)",
};
