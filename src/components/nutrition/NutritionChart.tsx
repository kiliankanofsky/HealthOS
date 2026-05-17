"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMemo, useRef } from "react";

import type { SmoothPoint } from "@/lib/utils/loess";

export type NutritionChartPoint = {
  date: string;
  // Wert für die Linie. null = Cheat Day (Linie unterbrochen, Punkt landet
  // oberhalb der Linie als Indikator).
  caloriesKcal: number | null;
  // Roh-Wert von fddb, unabhängig von Cheat-Meal-Logik (nur Anzeige im Tooltip).
  rawCaloriesKcal: number | null;
  kcalTarget: number | null;
  cheatDay?: boolean;
  alcohol?: boolean;
  cheatMeal?: boolean;
};

type Props = {
  data: NutritionChartPoint[];
  smoothed: SmoothPoint[] | null;
  showTags: boolean;
  dense?: boolean;
  onOpenDay?: (date: string) => void;
};

const NUTRITION_GREEN = "#10b981"; // emerald-500
const NUTRITION_GREEN_GHOST = "rgba(16, 185, 129, 0.45)"; // dezenter für Cheat-Day-Brücke
const SMOOTH_COLOR = "rgba(140, 140, 140, 0.55)";
const TAG_COLOR = "#E11D48"; // rose-600

export function NutritionChart({
  data,
  smoothed,
  showTags,
  dense = false,
  onOpenDay,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const values = useMemo(
    () =>
      data
        .map((d) => d.caloriesKcal)
        .filter((v): v is number => v !== null),
    [data],
  );

  // Y-Domain auf hübsche 200er-Schritte runden.
  const rawMin = values.length > 0 ? Math.min(...values) : 0;
  const rawMax = values.length > 0 ? Math.max(...values) : 2000;
  const min = Math.max(0, Math.floor((rawMin - 200) / 200) * 200);
  // Etwas extra Platz oben, damit der Cheat-Day-Indikator oberhalb der Linie
  // sitzt, ohne abgeschnitten zu werden.
  const max = Math.ceil((rawMax + 400) / 200) * 200;

  // Position für den Cheat-Day-Indikator: bewusst oberhalb der höchsten realen
  // Linie, damit der Punkt vom Linienverlauf abgehoben wirkt.
  const cheatDayY = max - 100;

  const smoothMap = useMemo(
    () => (smoothed ? new Map(smoothed.map((s) => [s.date, s.smoothed])) : null),
    [smoothed],
  );

  // Ghost-Linien für Cheat-Day-Gaps: nur an Cheat-Day-Positionen + dem
  // unmittelbaren prev/next Anker-Punkt einen Wert, sonst undefined. So zeichnet
  // Recharts (mit connectNulls=false) nur ein einziges Segment exakt über die
  // Lücke — die gestrichelte Linie ist klar auf den fehlenden Bereich begrenzt.
  const ghostLines = useMemo(() => {
    const calories = new Array<number | undefined>(data.length).fill(undefined);
    const trend = new Array<number | undefined>(data.length).fill(undefined);
    for (let i = 0; i < data.length; i++) {
      if (!data[i].cheatDay) continue;
      // raw calorie bridge
      fillBridge(
        i,
        calories,
        (j) =>
          data[j].cheatDay || data[j].caloriesKcal === null
            ? null
            : data[j].caloriesKcal,
        data.length,
      );
      // smoothed bridge — nur wenn überhaupt eine geglättete Linie gerendert wird
      if (smoothMap) {
        fillBridge(
          i,
          trend,
          (j) => {
            if (data[j].cheatDay) return null;
            const v = smoothMap.get(data[j].date);
            return v === undefined ? null : v;
          },
          data.length,
        );
      }
    }
    return { calories, trend };
  }, [data, smoothMap]);

  const merged = useMemo(() => {
    return data.map((d, i) => ({
      ...d,
      smoothed: smoothMap?.get(d.date),
      caloriesGhost: ghostLines.calories[i],
      smoothedGhost: ghostLines.trend[i],
      // Separater Datenpfad für Cheat-Day-Marker — nur an Tagen mit Cheat-Day
      // gesetzt, sonst undefined, damit Recharts nichts rendert.
      cheatDayMarker:
        d.cheatDay && showTags ? cheatDayY : undefined,
    }));
  }, [data, smoothMap, ghostLines, showTags, cheatDayY]);

  if (data.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center text-sm text-muted-foreground">
        Keine Daten vorhanden.
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={merged}
          margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          onClick={(state) => {
            const label = state?.activeLabel;
            if (typeof label !== "string") return;
            if (onOpenDay) onOpenDay(label);
          }}
          style={onOpenDay ? { cursor: "pointer" } : undefined}
        >
          <CartesianGrid stroke="currentColor" opacity={0.07} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: string) => formatTickDate(value)}
            minTickGap={32}
          />
          <YAxis
            domain={[min, max]}
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v: number) => v.toLocaleString("de-DE")}
          />

          <Tooltip
            cursor={{ stroke: NUTRITION_GREEN, strokeOpacity: 0.2, strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.08)",
              padding: "8px 12px",
              fontSize: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            }}
            labelFormatter={(label) => formatLabelDate(String(label))}
            formatter={(value, name, item) => {
              const v = Number(value);
              if (name === "smoothed") {
                return [
                  Number.isFinite(v) ? `${v.toLocaleString("de-DE")} kcal` : "–",
                  "Trend",
                ];
              }
              if (name === "caloriesGhost" || name === "smoothedGhost") return null;
              if (name === "cheatDayMarker") {
                return ["Cheat Day", "Tag"];
              }
              // Rohwert + Hinweise bei Cheat-Meal anzeigen.
              const payload = (
                item as { payload?: NutritionChartPoint } | undefined
              )?.payload;
              if (payload?.cheatMeal && payload.kcalTarget != null) {
                return [
                  `${payload.kcalTarget.toLocaleString("de-DE")} kcal (Ziel · Cheat Meal)`,
                  "Aufgenommen",
                ];
              }
              return [
                Number.isFinite(v) ? `${v.toLocaleString("de-DE")} kcal` : "–",
                "Aufgenommen",
              ];
            }}
          />

          {smoothed && (
            <>
              {/* Ghost-Brücke für die Trend-Linie an Cheat-Day-Gaps. */}
              <Line
                type="monotone"
                dataKey="smoothedGhost"
                stroke={SMOOTH_COLOR}
                strokeOpacity={0.6}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                connectNulls={false}
                legendType="none"
              />
              <Line
                type="monotone"
                dataKey="smoothed"
                stroke={SMOOTH_COLOR}
                strokeWidth={1.75}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            </>
          )}

          {/* Ghost-Linie für die Aufgenommen-Linie an Cheat-Day-Gaps. */}
          <Line
            type="monotone"
            dataKey="caloriesGhost"
            stroke={NUTRITION_GREEN_GHOST}
            strokeWidth={dense ? 1.4 : 2}
            strokeDasharray="4 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
            connectNulls={false}
            legendType="none"
          />

          <Line
            type="monotone"
            dataKey="caloriesKcal"
            stroke={NUTRITION_GREEN}
            strokeWidth={dense ? 1.4 : 2}
            connectNulls={false}
            dot={(props: DotRenderProps) => {
              const { cx, cy, payload, index } = props;
              const onLineTag =
                showTags &&
                (payload?.cheatMeal === true || payload?.alcohol === true);
              if (!onLineTag) return <g key={`d-${index}`} />;
              if (typeof cx !== "number" || typeof cy !== "number") {
                return <g key={`d-${index}`} />;
              }
              return (
                <circle
                  key={`d-${index}`}
                  cx={cx}
                  cy={cy}
                  r={4.4}
                  fill={TAG_COLOR}
                  stroke="white"
                  strokeWidth={1.5}
                />
              );
            }}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />

          {/* Cheat-Day-Marker: unsichtbare Linie, sichtbarer Punkt oberhalb. */}
          <Line
            type="monotone"
            dataKey="cheatDayMarker"
            stroke="transparent"
            strokeWidth={0}
            isAnimationActive={false}
            connectNulls={false}
            activeDot={false}
            dot={(props: DotRenderProps) => {
              const { cx, cy, payload, index } = props;
              if (!showTags || payload?.cheatDay !== true) {
                return <g key={`cd-${index}`} />;
              }
              if (typeof cx !== "number" || typeof cy !== "number") {
                return <g key={`cd-${index}`} />;
              }
              return (
                <g key={`cd-${index}`}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={4.4}
                    fill={TAG_COLOR}
                    stroke="white"
                    strokeWidth={1.5}
                  />
                </g>
              );
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type DotRenderProps = {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: NutritionChartPoint & { smoothed?: number; cheatDayMarker?: number };
};

function formatTickDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}.`;
}

function formatLabelDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// Setzt Ghost-Werte für eine einzelne Cheat-Day-Position `i`: linear
// interpolierter Wert an `i`, identische Anker-Werte bei prev und next, alle
// übrigen Slots bleiben undefined. So entsteht beim Rendern (connectNulls=false)
// ein einziges Liniensegment, das exakt über dem Gap liegt — ohne dass die
// gestrichelte Linie irgendwo neben der Lücke durchscheint.
function fillBridge(
  i: number,
  out: (number | undefined)[],
  valueAt: (j: number) => number | null,
  length: number,
): void {
  let prev = i - 1;
  while (prev >= 0 && valueAt(prev) === null) prev--;
  let next = i + 1;
  while (next < length && valueAt(next) === null) next++;
  const prevV = prev >= 0 ? valueAt(prev) : null;
  const nextV = next < length ? valueAt(next) : null;
  if (prevV !== null && nextV !== null) {
    const t = (i - prev) / (next - prev);
    out[i] = prevV + (nextV - prevV) * t;
    out[prev] = prevV;
    out[next] = nextV;
  } else if (prevV !== null) {
    out[i] = prevV;
    out[prev] = prevV;
  } else if (nextV !== null) {
    out[i] = nextV;
    out[next] = nextV;
  }
}

