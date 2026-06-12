"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { loessSmooth, recommendedSpan } from "@/lib/utils/loess";
import { bestE1RM, round1, volumeLoad } from "@/lib/utils/strength";

export type SessionAggregate = {
  date: string; // YYYY-MM-DD
  cycle: number;
  // Pro Übung die ausgeführten Sätze. unilateral + weightMode fließen in
  // den Score ein (siehe effectiveE1RM / volumeLoad in @/lib/utils/strength).
  exercises: Array<{
    unilateral: boolean;
    setsForChart: Array<{
      weightKg: number;
      reps: number;
      weightMode: "per-side" | "summed";
    }>;
  }>;
};

type Metric = "e1rm" | "volume";

const OPTIONS: { value: Metric; label: string }[] = [
  { value: "e1rm", label: "Σ Best e1RM" },
  { value: "volume", label: "Volume Load" },
];

const PRIMARY = "#0F172A";

type Props = {
  sessions: SessionAggregate[];
  templateSlug: string;
};

type Row = {
  date: string;
  cycle: number;
  score: number;
  // LOESS-geglätteter Score — Sessions liegen unregelmäßig (Tageslücken),
  // die zeitbasierte Glättung macht den Trend trotzdem lesbar.
  trend: number | null;
};

export function WorkoutOverviewChart({ sessions, templateSlug }: Props) {
  const router = useRouter();
  const [metric, setMetric] = useState<Metric>("e1rm");

  const rows: Row[] = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
    const base = sorted.map((s) => {
      let score = 0;
      for (const ex of s.exercises) {
        // Sätze mit Übungs-Kontext (unilateral) anreichern, damit
        // bestE1RM/volumeLoad den Weight-Mode korrekt anwenden.
        const enriched = ex.setsForChart.map((set) => ({
          ...set,
          unilateral: ex.unilateral,
        }));
        if (metric === "e1rm") {
          const best = bestE1RM(enriched);
          if (best !== null) score += best;
        } else {
          score += volumeLoad(enriched);
        }
      }
      return { date: s.date, cycle: s.cycle, score: round1(score) };
    });

    // LOESS erst ab 5 Sessions — darunter ist die Glättung nur Deko.
    if (base.length < 5) {
      return base.map((r) => ({ ...r, trend: null }));
    }
    const smoothed = loessSmooth(
      base.map((r) => ({ date: r.date, weight: r.score })),
      recommendedSpan(base.length),
    );
    const trendByDate = new Map(smoothed.map((p) => [p.date, p.smoothed]));
    return base.map((r) => ({
      ...r,
      trend: round1(trendByDate.get(r.date) ?? r.score),
    }));
  }, [sessions, metric]);

  if (sessions.length < 2) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
          Verlauf
        </p>
        <p className="rounded-xl bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
          Mindestens zwei Sessions nötig, damit der Verlauf etwas aussagt.
        </p>
      </div>
    );
  }

  const unit = metric === "e1rm" ? "kg" : "kg-Reps";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
            Verlauf
          </p>
          {rows.some((r) => r.trend !== null) && (
            <p className="text-[10px] text-muted-foreground/70">
              gestrichelt = LOESS-Trend
            </p>
          )}
        </div>
        <SegmentedControl options={OPTIONS} value={metric} onChange={setMetric} size="sm" />
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 8, right: 16, bottom: 8, left: -16 }}
            onClick={(state) => {
              const dateClicked = state?.activeLabel;
              if (typeof dateClicked === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateClicked)) {
                router.push(`/hypertrophy/${templateSlug}/${dateClicked}`);
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--color-muted-foreground)" }}
            />
            <YAxis
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--color-muted-foreground)" }}
              domain={["auto", "auto"]}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Row;
                return (
                  <div className="rounded-lg bg-card px-3 py-2 text-xs shadow-md ring-1 ring-foreground/10">
                    <p className="mb-0.5 font-medium">{formatLong(String(label))}</p>
                    <p className="text-muted-foreground">{row.cycle}. Session</p>
                    <p className="mt-1 tabular-nums">
                      {OPTIONS.find((o) => o.value === metric)?.label}:{" "}
                      <span className="font-medium">{row.score.toLocaleString("de-DE")} {unit}</span>
                    </p>
                    {row.trend !== null && (
                      <p className="tabular-nums text-muted-foreground">
                        Trend (LOESS): {row.trend.toLocaleString("de-DE")} {unit}
                      </p>
                    )}
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke={PRIMARY}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: PRIMARY }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
            {/* LOESS-Trend — gestrichelt, ohne Punkte, nicht klickbar. */}
            <Line
              type="monotone"
              dataKey="trend"
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

function formatLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "long",
  });
}
