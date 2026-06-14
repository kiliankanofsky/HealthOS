"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { RunSession } from "@/lib/db/schema";

import {
  getCutoffIso,
  PeriodPicker,
  RANGE_TITLE,
  type Range,
} from "./PeriodPicker";

// Strava-Akzent für die Lauf-Linie (siehe Plan).
const STRAVA_ORANGE = "#FC5200";

export type WeekKm = {
  weekStartIso: string; // YYYY-MM-DD (Montag)
  km: number;
};

// Minimale Run-Felder, die KmGraphSection braucht (kein lapsJson etc.).
type RunStats = Pick<
  RunSession,
  "date" | "distanceMeters" | "durationSeconds" | "elevationGainMeters"
>;

type Props = {
  /** Alle Wochen-Totals aus der DB — die Komponente schneidet selbst. */
  allWeeks: WeekKm[];
  /** Alle Run-Sessions für die Stats-Berechnung im gewählten Zeitraum. */
  runs: RunStats[];
};

export function KmGraphSection({ allWeeks, runs }: Props) {
  const [range, setRange] = useState<Range>("1w");

  const cutoffIso = useMemo(() => getCutoffIso(range), [range]);

  // Stats für den gewählten Zeitraum (Distanz, Zeit, Höhenmeter).
  const stats = useMemo(() => {
    const filtered = cutoffIso
      ? runs.filter((r) => r.date >= cutoffIso)
      : runs;
    return {
      distanceKm: filtered.reduce((s, r) => s + r.distanceMeters / 1000, 0),
      durationSec: filtered.reduce((s, r) => s + r.durationSeconds, 0),
      elevationMeters: filtered.reduce(
        (s, r) => s + (r.elevationGainMeters ?? 0),
        0,
      ),
    };
  }, [runs, cutoffIso]);

  // Chart: Wochen-Balken für den gewählten Zeitraum (min 4 Wochen für gute
  // Optik; "1w" und "4w" teilen sich das 4-Wochen-Fenster).
  const chartWeeks = useMemo(
    () => buildChartWeeks(allWeeks, range),
    [allWeeks, range],
  );

  const max = Math.max(1, ...chartWeeks.map((s) => s.km));
  const topTick = niceCeil(max);
  const midTick = topTick / 2;

  const monthLabels = useMemo(
    () => buildMonthLabels(chartWeeks),
    [chartWeeks],
  );

  const title = RANGE_TITLE[range];

  const hours = Math.floor(stats.durationSec / 3600);
  const minutes = Math.floor((stats.durationSec % 3600) / 60);

  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-heading text-2xl font-semibold">{title}</h2>
        <PeriodPicker value={range} onChange={setRange} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-6">
        <Stat label="Distanz" value={formatKm(stats.distanceKm)} unit="km" />
        <Stat
          label="Zeit"
          value={
            hours > 0
              ? `${hours}h ${String(minutes).padStart(2, "0")}`
              : `${minutes}`
          }
          unit="min"
        />
        <Stat
          label="Höhenmeter"
          value={Math.round(stats.elevationMeters).toString()}
          unit="m"
        />
      </div>

      <div className="mt-3 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartWeeks}
            margin={{ top: 8, right: 56, bottom: 8, left: 0 }}
          >
            <defs>
              <linearGradient id="km-area" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={STRAVA_ORANGE}
                  stopOpacity={0.35}
                />
                <stop
                  offset="100%"
                  stopColor={STRAVA_ORANGE}
                  stopOpacity={0.0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="currentColor"
              strokeOpacity={0.12}
              vertical={false}
            />
            <XAxis
              dataKey="weekStartIso"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "currentColor", opacity: 0.7 }}
              tickFormatter={(iso: string) => monthLabels.get(iso) ?? ""}
              interval={0}
              minTickGap={0}
            />
            <YAxis
              orientation="right"
              ticks={[0, midTick, topTick]}
              domain={[0, topTick]}
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fontSize: 11, fill: "currentColor", opacity: 0.7 }}
              tickFormatter={(v: number) => `${formatKm(v)} km`}
            />
            <Tooltip
              cursor={{ stroke: STRAVA_ORANGE, strokeOpacity: 0.3 }}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.08)",
                padding: "8px 12px",
                fontSize: 12,
                boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                backgroundColor: "var(--card)",
              }}
              labelFormatter={(iso) =>
                typeof iso === "string" ? `Woche ab ${formatDe(iso)}` : ""
              }
              formatter={(value) => [
                typeof value === "number" ? `${formatKm(value)} km` : "—",
                "Distanz",
              ]}
            />
            <Area
              type="linear"
              dataKey="km"
              stroke={STRAVA_ORANGE}
              strokeWidth={2.5}
              fill="url(#km-area)"
              dot={{
                r: 4,
                fill: STRAVA_ORANGE,
                stroke: "#fff",
                strokeWidth: 1.5,
              }}
              activeDot={{
                r: 6,
                fill: STRAVA_ORANGE,
                stroke: "#fff",
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
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
  unit: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">
        {value}
        <span className="ml-1 text-sm font-normal text-muted-foreground">
          {unit}
        </span>
      </p>
    </div>
  );
}

// ---- helpers ----

function formatKm(v: number): string {
  return v.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: v < 10 ? 1 : 0,
  });
}

function formatDe(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

function niceCeil(v: number): number {
  if (v <= 5) return 5;
  if (v <= 10) return 10;
  if (v <= 20) return 20;
  if (v <= 25) return 25;
  if (v <= 50) return 50;
  return Math.ceil(v / 25) * 25;
}

// Chartfenster für den gewählten Zeitraum:
//  · "1w" / "4w" → letzte 8 Wochen anzeigen (genug Kontext, nie "1 Balken")
//  · "12w"       → letzte 12 Wochen
//  · "6m"        → letzte 26 Wochen (~6 Monate)
//  · "max"       → alle vorhandenen Wochen, aufsteigend
function buildChartWeeks(allWeeks: WeekKm[], range: Range): WeekKm[] {
  const byWeek = new Map(allWeeks.map((w) => [w.weekStartIso, w.km]));

  if (range === "max") {
    return [...allWeeks].sort((a, b) =>
      a.weekStartIso.localeCompare(b.weekStartIso),
    );
  }

  const chartCount =
    range === "6m" ? 26 : range === "12w" ? 12 : 8; // "1w" und "4w" → 8

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow);

  const out: WeekKm[] = [];
  for (let i = chartCount - 1; i >= 0; i--) {
    const d = new Date(monday);
    d.setDate(monday.getDate() - i * 7);
    const iso = toIso(d);
    out.push({ weekStartIso: iso, km: byWeek.get(iso) ?? 0 });
  }
  return out;
}

function buildMonthLabels(series: WeekKm[]): Map<string, string> {
  const MONTHS_DE = [
    "JAN", "FEB", "MÄR", "APR", "MAI", "JUN",
    "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ",
  ];
  const m = new Map<string, string>();
  let lastMonth = -1;
  for (const w of series) {
    const d = new Date(`${w.weekStartIso}T12:00:00Z`);
    const monthIdx = d.getUTCMonth();
    if (monthIdx !== lastMonth) {
      m.set(w.weekStartIso, MONTHS_DE[monthIdx]);
      lastMonth = monthIdx;
    }
  }
  return m;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
